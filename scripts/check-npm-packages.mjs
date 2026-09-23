#!/usr/bin/env node
// Gate for the npm packages built from this repository.
//
// For each package: pack it (which runs its prepack staging), hold the tarball
// file list to an exact allowlist, refuse anything shaped like a test, fixture,
// secret or environment file, then install the real tarball into an empty
// project and use it the way its README says to. A package whose file list
// changes must change EXPECTED here in the same commit, which puts the change
// in front of a reviewer instead of in a published tarball.
//
// Publishing is not done here. CI runs `npm publish --dry-run` separately.
//
// Usage: node scripts/check-npm-packages.mjs
import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED = {
  aieds: [
    "LICENSE",
    "LICENSE-DOCS",
    "NOTICE",
    "README.md",
    "lib/dist/factors.d.ts",
    "lib/dist/factors.js",
    "lib/dist/index.d.ts",
    "lib/dist/index.js",
    "package.json",
    "spec/aieds.schema.json",
    "spec/v2/aieds-factors.json",
  ],
  k13: [
    "K13.md",
    "LICENSE",
    "LICENSE-DOCS",
    "NOTICE",
    "README.md",
    "bin/k13.mjs",
    "package.json",
    "src/index.mjs",
  ],
  earthplus: [
    "LICENSE",
    "LICENSE-DOCS",
    "NOTICE",
    "README.md",
    "dist/cli.js",
    "dist/index.d.ts",
    "dist/index.js",
    "methodology.md",
    "package.json",
  ],
};

// The E+ standard version the methodology text declares ("**Version:** x.y.z").
// The earthplus package's MAJOR.MINOR must equal this standard's MAJOR.MINOR.
// Its PATCH is the checker's own, so a checker fix (1.2.0 -> 1.2.1) ships
// without the standard moving, and the bundled methodology is still checked to
// be exactly this version.
const EPLUS_VERSION = (() => {
  const m = readFileSync(join(repoRoot, "eplus", "v1", "methodology.md"), "utf8").match(
    /^\*\*Version:\*\* (\d+\.\d+\.\d+)/m,
  );
  if (!m) throw new Error("eplus/v1/methodology.md declares no **Version:**");
  return m[1];
})();

// Never in a tarball, whatever the allowlist says.
const FORBIDDEN = [
  /(^|\/)(test|tests|__tests__|fixtures?|examples?)\//i,
  /\.test\.[cm]?[jt]s$/i,
  /(^|\/)\.env/i,
  /(^|\/)\.npmrc$/i,
  /secret/i,
  /\.(pem|key|p12|pfx|tgz)$/i,
  /\.tsbuildinfo$/i,
];

// Smoke tests: the README usage, run against the installed tarball.
const SMOKE = {
  aieds: `
import { disclosureFromResponse, schemaRecordFromDisclosure, METHODOLOGY_VERSION } from "@randomknights/aieds";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const schema = require("@randomknights/aieds/schema.json");
const factors = require("@randomknights/aieds/factors.json");
const pkg = require("@randomknights/aieds/package.json");
if (METHODOLOGY_VERSION !== factors.methodologyVersion) throw new Error("version drift");
if (pkg.version !== METHODOLOGY_VERSION) throw new Error("package version " + pkg.version + " is not methodology " + METHODOLOGY_VERSION);
if (!String(schema.$id).includes("aieds")) throw new Error("schema not loaded");
const d = disclosureFromResponse({ provider: "GoogleAI", model: "gemini-2.0-flash", inputTokens: 412, outputTokens: 890 });
if (!(d.energyWh > 0) || d.provenance !== "vendor-published") throw new Error("bad disclosure");
const r = schemaRecordFromDisclosure(d, { id: "x", subject: { kind: "model", name: "m" }, scope: "inference", window: "PT1S", source: "smoke" });
if (r.energyKWh !== d.energyWh / 1000) throw new Error("bad record");
console.log("aieds smoke ok", METHODOLOGY_VERSION);
`,
  k13: `
import { checkText, K13_VERSION } from "@randomknights/k13";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("@randomknights/k13/package.json");
if (pkg.version !== K13_VERSION) throw new Error("package version " + pkg.version + " is not K13 " + K13_VERSION);
if (!checkText("fine.").ok) throw new Error("clean text failed");
if (checkText("a " + String.fromCharCode(0x2014) + " b").ok) throw new Error("em dash passed");
console.log("k13 smoke ok", K13_VERSION);
`,
  // Both module systems, one conforming and one nonconforming sample document.
  earthplus: `
import { verifyPublishedScoreDoc, formatConformanceReport } from "@randomknights/earthplus";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const cjs = require("@randomknights/earthplus");
const pkg = require("@randomknights/earthplus/package.json");
const methodology = readFileSync(require.resolve("@randomknights/earthplus/methodology.md"), "utf8");
const eplusVersion = ${JSON.stringify(EPLUS_VERSION)};
const line = (v) => v.split(".").slice(0, 2).join(".");
if (!methodology.includes("**Version:** " + eplusVersion)) throw new Error("the bundled methodology is not E+ " + eplusVersion);
if (line(pkg.version) !== line(eplusVersion)) throw new Error("package version " + pkg.version + " does not implement E+ " + eplusVersion);
if (cjs.verifyPublishedScoreDoc !== verifyPublishedScoreDoc) throw new Error("require and import disagree");
const good = verifyPublishedScoreDoc(JSON.parse(readFileSync("conforming.json", "utf8")));
if (!good.ok || good.findings.length) throw new Error("conforming sample failed: " + formatConformanceReport(good));
const bad = verifyPublishedScoreDoc(JSON.parse(readFileSync("nonconforming.json", "utf8")));
if (bad.ok || !bad.findings.some((f) => f.path === "global.score")) throw new Error("nonconforming sample passed");
console.log("earthplus smoke ok", pkg.version);
`,
};

// Sample documents the earthplus smoke test checks, copied into the app.
const SAMPLES = {
  earthplus: ["conforming.json", "nonconforming.json"],
};

const npm = (args, cwd) =>
  execSync(`npm ${args}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

let failed = false;
const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  failed = true;
};

for (const name of Object.keys(EXPECTED)) {
  const pkgDir = join(repoRoot, "packages", name);
  const outDir = mkdtempSync(join(tmpdir(), `npm-${name}-`));
  const packed = JSON.parse(npm(`pack --json --pack-destination "${outDir}"`, pkgDir));
  const files = packed[0].files.map((f) => f.path).sort();
  const expected = [...EXPECTED[name]].sort();

  const extra = files.filter((f) => !expected.includes(f));
  const missing = expected.filter((f) => !files.includes(f));
  if (extra.length) fail(`${name}: unexpected files in tarball: ${extra.join(", ")}`);
  if (missing.length) fail(`${name}: files missing from tarball: ${missing.join(", ")}`);
  for (const f of files) {
    if (FORBIDDEN.some((re) => re.test(f))) fail(`${name}: forbidden file in tarball: ${f}`);
  }
  console.log(`${packed[0].id}: ${files.length} files`);
  for (const f of files) console.log(`  ${f}`);

  // Install the real tarball into an empty project and use it.
  const tgz = readdirSync(outDir).find((f) => f.endsWith(".tgz"));
  const app = mkdtempSync(join(tmpdir(), `npm-${name}-app-`));
  writeFileSync(join(app, "package.json"), '{"name":"smoke","private":true,"type":"module"}\n');
  npm(`install --no-audit --no-fund --offline "${join(outDir, tgz)}"`, app);
  writeFileSync(join(app, "smoke.mjs"), SMOKE[name]);
  for (const f of SAMPLES[name] ?? []) copyFileSync(join(pkgDir, "test", f), join(app, f));
  try {
    process.stdout.write(execFileSync(process.execPath, ["smoke.mjs"], { cwd: app, encoding: "utf8" }));
  } catch (err) {
    fail(`${name}: smoke test against the installed tarball: ${err.stderr || err.message}`);
  }
  if (name === "k13") {
    // The bin is linked and runs: exit 0 on a clean file.
    writeFileSync(join(app, "clean.md"), "All clear.\n");
    try {
      npm("exec --offline -- k13 check clean.md", app);
    } catch (err) {
      fail(`k13: the installed k13 bin did not pass a clean file: ${err.message}`);
    }
  }
  if (name === "earthplus") {
    // The installed bin: exit 0 on the conforming sample, exit 1 on the other.
    const status = (file) => {
      try {
        npm(`exec --offline -- eplus-conformance ${file}`, app);
        return 0;
      } catch (err) {
        return err.status;
      }
    };
    const good = status("conforming.json");
    const bad = status("nonconforming.json");
    if (good !== 0) fail(`earthplus: eplus-conformance exited ${good} on the conforming sample`);
    if (bad !== 1) fail(`earthplus: eplus-conformance exited ${bad} on the nonconforming sample`);
    if (good === 0 && bad === 1) console.log("earthplus bin ok (exit 0 conforming, exit 1 nonconforming)");
  }
}

if (failed) process.exit(1);
console.log("npm packages: file lists and installed smoke tests ok");

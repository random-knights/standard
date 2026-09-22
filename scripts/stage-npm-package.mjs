#!/usr/bin/env node
// Stage the files an npm package needs from their canonical places in this
// repository into packages/<name>/, so the package can be packed from there.
//
// WHY THIS EXISTS. npm packs one directory and cannot reach outside it, but
// every file these packages ship already has exactly one home elsewhere in the
// repository: the factor table in spec/v2/, the schema in spec/, the reference
// library in lib/, the K13 text at the root. Committing second copies is how a
// table drifts (see lib/src/factors.ts), so the copies are made at pack time
// instead and are gitignored. Each package's "prepack" script runs this, so
// `npm pack` and `npm publish` from packages/<name>/ always ship what is on the
// checked-out commit.
//
// Usage: node scripts/stage-npm-package.mjs <aieds|k13>
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];

// Shipped with every package: both licenses and the notice that says which
// part of the package each one covers.
const LEGAL = ["LICENSE", "LICENSE-DOCS", "NOTICE"];

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function run(cmd, cwd) {
  // Child output goes to stderr so `npm pack --json` keeps a clean stdout.
  execSync(cmd, { cwd, stdio: ["ignore", 2, 2], shell: true });
}

function stageAieds(pkgDir) {
  const libDir = join(repoRoot, "lib");
  // A clean build every time: a stale dist/ can hold a file whose source was
  // deleted, and that file would ship.
  if (!existsSync(join(libDir, "node_modules", "typescript"))) {
    run("npm ci --no-audit --no-fund", libDir);
  }
  rmSync(join(libDir, "dist"), { recursive: true, force: true });
  run("npm run build", libDir);

  // lib/dist/factors.js resolves the table as ../../spec/v2/aieds-factors.json,
  // so the package mirrors the repository layout: lib/dist/ and spec/ side by
  // side under the package root. The compiled tests (dist/test/) stay out.
  rmSync(join(pkgDir, "lib"), { recursive: true, force: true });
  rmSync(join(pkgDir, "spec"), { recursive: true, force: true });
  for (const f of readdirSync(join(libDir, "dist"))) {
    if (/\.(js|d\.ts)$/.test(f)) {
      copy(join(libDir, "dist", f), join(pkgDir, "lib", "dist", f));
    }
  }
  copy(join(repoRoot, "spec", "aieds.schema.json"), join(pkgDir, "spec", "aieds.schema.json"));
  copy(
    join(repoRoot, "spec", "v2", "aieds-factors.json"),
    join(pkgDir, "spec", "v2", "aieds-factors.json"),
  );
}

function stageK13(pkgDir) {
  copy(join(repoRoot, "K13.md"), join(pkgDir, "K13.md"));
}

const STAGERS = { aieds: stageAieds, k13: stageK13 };
const stage = STAGERS[name];
if (!stage) {
  console.error(`usage: node scripts/stage-npm-package.mjs <${Object.keys(STAGERS).join("|")}>`);
  process.exit(2);
}
const pkgDir = join(repoRoot, "packages", name);
stage(pkgDir);
for (const f of LEGAL) copy(join(repoRoot, f), join(pkgDir, f));
console.error(`staged packages/${name}`);

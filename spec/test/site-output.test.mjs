// Gate: the site as WRITTEN TO DISK is byte-identical to the repo sources,
// and every artifact the README and the index page promise is actually
// emitted.
//
// WHY THIS EXISTS. build-site.test.mjs checks the in-memory file map. On
// 2026-08-31 the live host was deployed by hand from a working copy with an
// older build script: the schema went out with CRLF line endings (sha256
// d5e00d71..., 6533 bytes) while the repo file was LF (027110fc..., 6362
// bytes), so a consumer hashing the download could never match the repo,
// and aieds-factors.json plus methodology.md were never emitted at all
// (404). Nothing compared the deploy tree to the sources. This test does:
// it runs the real writeSite(), then hashes what landed on disk.
//
// The schema and the factor table are marked -text in .gitattributes, so a
// CR that gets committed into either source would be served forever. The
// second test refuses that at the source.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const outputRoot = resolve(repoRoot, ".firebase", "standard-site");

const { expectedFiles, writeSite } = await import(
  "file://" + resolve(repoRoot, "scripts/build-site.mjs")
);

const schema = JSON.parse(
  readFileSync(resolve(repoRoot, "spec/aieds.schema.json"), "utf8"),
);
const aiedsDir = new URL(schema.$id).pathname
  .replace(/^\//, "")
  .replace(/\/[^/]+$/, "");

// Every artifact a URL is published for, and the single source it must
// equal. README.md and the index page promise exactly these.
const PROMISED = [
  [`${aiedsDir}/aieds.schema.json`, "spec/aieds.schema.json"],
  [`${aiedsDir}/aieds-factors.json`, "spec/v2/aieds-factors.json"],
  [`${aiedsDir}/methodology.md`, "spec/methodology.md"],
  ["k13/v1/K13.md", "K13.md"],
  ["LICENSE", "LICENSE"],
  ["LICENSE-DOCS", "LICENSE-DOCS"],
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(outputRoot, full).replaceAll("\\", "/"));
  }
  return out;
}

test("the site written to disk is byte-identical to the repo sources", () => {
  writeSite();
  for (const [servedPath, sourcePath] of PROMISED) {
    const out = resolve(outputRoot, servedPath);
    assert.ok(existsSync(out), `${servedPath} was not written (would 404)`);
    const served = readFileSync(out);
    const source = readFileSync(resolve(repoRoot, sourcePath));
    assert.equal(
      sha256(served),
      sha256(source),
      `${servedPath} on disk (${served.length} bytes) differs from ` +
        `${sourcePath} (${source.length} bytes); the served download must ` +
        `hash to the repo file`,
    );
  }
});

test("the on-disk tree has exactly the files the build promises, no more", () => {
  writeSite();
  const onDisk = walk(outputRoot).sort();
  const promised = [...expectedFiles().keys()]
    .map((k) => k.replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(onDisk, promised);
});

test("no served text artifact carries a CR byte at the source", () => {
  for (const [servedPath, sourcePath] of PROMISED) {
    const bytes = readFileSync(resolve(repoRoot, sourcePath));
    assert.ok(
      !bytes.includes(0x0d),
      `${sourcePath} contains a CR byte; it would be served as CRLF at ` +
        `${servedPath} and never hash to the LF file`,
    );
  }
});

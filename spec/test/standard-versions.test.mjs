// Gate: spec/v2/standard-versions.json IS the three canonical documents,
// mechanically, and the site's index page agrees with it.
//
// WHY THIS EXISTS, with the date on it. On 2026-09-15 the published site at
// standard.rand0m.ai announced K13 at version 1.1.0. K13.md said 2.0.0.
// CITATION.k13.cff said 2.0.0. The README template, the org profile page and
// three repo READMEs all said 2.0.0. The site was wrong on its own subject for
// a full major version, because scripts/build-site.mjs carried a LITERAL:
//
//     const K13 = { name: "K13", version: "1.1.0", ... }
//
// AiEDs and E+ had always derived their versions from their documents, and
// build-site.test.mjs already gated E+ against the text it declares. K13 had
// neither. This file closes that gap for all three at once and adds the thing
// that was missing generally: one machine-readable statement of the current
// versions, published for consumers, that cannot drift from the documents.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildVersions, serialise } from "../../scripts/emit-standard-versions.mjs";
import { expectedFiles } from "../../scripts/build-site.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const committedPath = join(repoRoot, "spec", "v2", "standard-versions.json");
const committedText = readFileSync(committedPath, "utf8");
const committed = JSON.parse(committedText);

const byId = new Map(committed.standards.map((s) => [s.id, s]));

function documentVersion(relPath) {
  const text = readFileSync(join(repoRoot, relPath), "utf8");
  const m = text.match(/\*\*Version:\*\*\s*([\d]+\.[\d]+\.[\d]+)/);
  assert.ok(m, `${relPath} no longer declares a version this gate can read`);
  return m[1];
}

test("the committed versions file is exactly what the documents produce", () => {
  // Byte equality, not field equality. A hand edit to the committed file is
  // the failure mode this whole lane exists to stop, so the check is against
  // the bytes a regeneration would write.
  assert.equal(
    committedText,
    serialise(buildVersions()),
    "spec/v2/standard-versions.json is not what scripts/emit-standard-versions.mjs " +
      "produces. Run `node scripts/emit-standard-versions.mjs` and commit the result; " +
      "do not hand-edit the file.",
  );
});

test("each standard's version matches the document that defines it", () => {
  // Stated separately from the byte check so a failure names the STANDARD
  // rather than just saying the file differs.
  assert.equal(byId.get("aieds").semver, documentVersion("spec/methodology.md"));
  assert.equal(byId.get("k13").semver, documentVersion("K13.md"));
  assert.equal(byId.get("eplus").semver, documentVersion("eplus/v1/methodology.md"));
});

test("the AiEDs row agrees with the factor table, which is its own gate", () => {
  const factors = JSON.parse(
    readFileSync(join(repoRoot, "spec", "v2", "aieds-factors.json"), "utf8"),
  );
  assert.equal(byId.get("aieds").semver, factors.methodologyVersion);
});

test("each CITATION file agrees with the version it cites", () => {
  const cff = (name) => {
    const text = readFileSync(join(repoRoot, name), "utf8");
    const m = text.match(/^version:\s*([^\s]+)\s*$/m);
    assert.ok(m, `${name} has no version field`);
    return m[1];
  };
  assert.equal(cff("CITATION.cff"), byId.get("aieds").semver, "CITATION.cff");
  assert.equal(cff("CITATION.k13.cff"), byId.get("k13").semver, "CITATION.k13.cff");
  assert.equal(cff("CITATION.eplus.cff"), byId.get("eplus").semver, "CITATION.eplus.cff");
});

test("a draft is displayed as a draft, so it cannot read as shipped", () => {
  for (const s of committed.standards) {
    if (s.semver === null) continue;
    const isDraft = /draft/i.test(s.status);
    assert.equal(
      s.version,
      isDraft ? `v${s.semver}-draft` : `v${s.semver}`,
      `${s.id}: display version disagrees with its own status`,
    );
  }
});

test("the site serves the versions file at the root, byte-identical", () => {
  const files = expectedFiles();
  const served = files.get("versions.json");
  assert.ok(served, "the site build no longer serves versions.json");
  assert.equal(
    served.toString("utf8"),
    committedText,
    "the served versions.json is not byte-identical to its repo source",
  );
});

test("the index page states the K13 version its own document declares", () => {
  // The gate that did not exist. build-site.test.mjs already had this for E+
  // ("the index page lists E+ at the version and status its own text
  // declares") and for AiEDs by way of the schema id check. K13 had no
  // counterpart, which is exactly why K13 was the one that went stale.
  const html = expectedFiles().get("index.html").toString("utf8");
  const k13 = byId.get("k13");
  assert.ok(
    html.includes(k13.semver),
    `the index page does not mention the K13 version ${k13.semver}`,
  );
  assert.ok(
    !/response standard 1\.1\.0/.test(html),
    "the index page still carries the superseded hardcoded K13 version 1.1.0",
  );
});

test("no standard row is missing a field a consumer renders", () => {
  assert.ok(committed.standards.length >= 3);
  for (const s of committed.standards) {
    for (const field of ["id", "name", "version", "description", "status"]) {
      assert.ok(
        typeof s[field] === "string" && s[field].trim().length > 0,
        `${s.id ?? "(unidentified)"}: missing ${field}`,
      );
    }
  }
  assert.equal(committed.source, "https://standard.rand0m.ai/versions.json");
});

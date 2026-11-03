// Gate: spec/v2/standard-versions.json IS the canonical documents,
// mechanically, and the site's index page agrees with it.
//
// WHY THIS EXISTS, with the date on it. On 2026-09-15 the published site at
// standard.rand0m.ai announced one standard a full major version behind what
// its own canonical text, its citation file, the README template, the org
// profile page and three repo READMEs all said, because
// scripts/build-site.mjs carried that version as a LITERAL instead of reading
// it out of the document.
//
// AiEDs and E+ derive their versions from their documents, and
// build-site.test.mjs gates E+ against the text it declares. This file holds
// every standard to that rule and adds the thing that was missing generally:
// one machine-readable statement of the current versions, published for
// consumers, that cannot drift from the documents.
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

test("the index page states each versioned standard's version", () => {
  // build-site.test.mjs checks E+ against its own text and AiEDs by way of the
  // schema id. This checks every versioned row of the versions file, so a
  // standard added later cannot reach the index page with a stale version.
  const html = expectedFiles().get("index.html").toString("utf8");
  for (const s of committed.standards) {
    if (s.semver === null) continue;
    assert.ok(
      html.includes(`methodology ${s.semver}`),
      `the index page does not state ${s.name} ${s.semver}`,
    );
  }
});

test("only the standards that continue are listed", () => {
  // The versions file is the table every consumer README renders, so the row
  // set is pinned: a row that comes back by accident shows up here first.
  assert.deepEqual(
    committed.standards.map((s) => s.id),
    ["eplus", "aieds", "ai-for-good"],
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

// The releases surface compares three tag series to the versions this
// repository ratified: AiEDs (v*), K13 (k13-v*) and E+ (eplus-v*). The
// comparison is a pure function in scripts/release-tags.mjs, so these tests
// feed it fixtures instead of the GitHub API.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { releaseRows, versionsForPrefix, compareSemver } from "../../scripts/release-tags.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const standards = [
  { id: "eplus", semver: "1.2.1" },
  { id: "aieds", semver: "2.4.0" },
  { id: "k13", semver: "2.2.0" },
  { id: "ai-for-good", semver: null },
];
const row = (rows, prefixId) => rows.find((r) => r.id.startsWith(prefixId));
const byName = (rows, name) => rows.find((r) => r.name === name);

// The tags that exist on origin today (2026-10-15): AiEDs only.
const TODAY = ["v1.0.0", "v1.1.0", "v2.0.0", "v2.3.1", "v2.4.0"];

test("today's tags: AiEDs ok, K13 and E+ UNTAGGED (the expected red until the owner tags)", () => {
  const rows = releaseRows(standards, TODAY);
  assert.equal(byName(rows, "AiEDs").state, "ok");
  assert.equal(byName(rows, "K13").state, "UNTAGGED");
  assert.equal(byName(rows, "K13").id, "k13-v2.2.0");
  assert.equal(byName(rows, "E+").state, "UNTAGGED");
  assert.equal(byName(rows, "E+").id, "eplus-v1.2.1");
});

test("the series do not read each other's tags", () => {
  // v2.2.0 is not a K13 tag and k13-v2.4.0 is not an AiEDs tag.
  assert.deepEqual(versionsForPrefix(["v2.2.0", "eplus-v2.2.0"], "k13-v"), []);
  assert.deepEqual(versionsForPrefix(["k13-v2.4.0", "eplus-v2.4.0"], "v"), []);
  const rows = releaseRows(standards, ["v2.2.0", "v1.2.1", "v2.4.0"]);
  assert.equal(byName(rows, "K13").state, "UNTAGGED");
  assert.equal(byName(rows, "E+").state, "UNTAGGED");
});

test("all current tags present is ok on every row", () => {
  const rows = releaseRows(standards, [...TODAY, "k13-v2.2.0", "eplus-v1.2.1"]);
  assert.deepEqual(rows.map((r) => r.state), ["ok", "ok", "ok"]);
});

test("a series is BEHIND when its newest tag is older than the repo version", () => {
  const rows = releaseRows(standards, [...TODAY, "k13-v2.1.0", "k13-v2.0.0", "eplus-v1.2.0"]);
  const k13 = byName(rows, "K13");
  const eplus = byName(rows, "E+");
  assert.equal(k13.state, "BEHIND");
  assert.equal(k13.live, "2.1.0");
  assert.equal(eplus.state, "BEHIND");
  assert.equal(eplus.live, "1.2.0");
});

test("newest is chosen numerically, not lexically", () => {
  const rows = releaseRows(
    [{ id: "k13", semver: "2.10.0" }],
    ["k13-v2.9.0", "k13-v2.10.0", "k13-v2.2.0"],
  );
  assert.equal(rows[0].live, "2.10.0");
  assert.equal(rows[0].state, "ok");
});

test("a tag newer than the checkout is ahead, which is not a failure", () => {
  const rows = releaseRows(standards, [...TODAY, "k13-v2.3.0", "eplus-v1.3.0"]);
  assert.equal(byName(rows, "K13").state, "ahead");
  assert.equal(byName(rows, "E+").state, "ahead");
});

test("the AiEDs row keeps the original exact-tag rule", () => {
  // Behind on AiEDs means the exact tag v2.4.0 is missing.
  const rows = releaseRows(standards, ["v1.0.0", "v2.3.1", "k13-v2.2.0", "eplus-v1.2.1"]);
  const aieds = byName(rows, "AiEDs");
  assert.equal(aieds.id, "v2.4.0");
  assert.equal(aieds.state, "UNTAGGED");
  assert.equal(aieds.live, null);
  // A later AiEDs tag does not satisfy the exact rule either: unchanged.
  const later = releaseRows(standards, ["v2.5.0"]);
  assert.equal(byName(later, "AiEDs").state, "UNTAGGED");
});

test("pre-release and malformed tags are ignored", () => {
  assert.deepEqual(versionsForPrefix(["k13-v2.2.0-rc1", "k13-v2.2", "k13-v2.2.0.1", "k13-vX"], "k13-v"), []);
});

test("compareSemver orders numeric triples and refuses non-numeric", () => {
  assert.equal(compareSemver("1.2.0", "1.2.1"), -1);
  assert.equal(compareSemver("1.10.0", "1.9.0"), 1);
  assert.equal(compareSemver("1.2.1", "1.2.1"), 0);
  assert.equal(compareSemver("x", "1.0.0"), null);
});

test("the checker uses the shared module and keeps the failing-state rule", () => {
  const checker = readFileSync(join(repoRoot, "scripts/check-published-site.mjs"), "utf8");
  assert.match(checker, /from "\.\/release-tags\.mjs"/);
  assert.match(checker, /releaseRows\(standards/);
  // 'ahead' and 'ok' are not in FAIL_STATES.
  const literal = /const FAIL_STATES = new Set\(\[([^\]]*)\]\)/.exec(checker);
  assert.ok(literal);
  assert.ok(!/ahead|"ok"/.test(literal[1]));
});

test("the standard-versions file defines the three series this check reads", () => {
  const repo = JSON.parse(readFileSync(join(repoRoot, "spec/v2/standard-versions.json"), "utf8"));
  const ids = repo.standards.map((s) => s.id);
  for (const id of ["aieds", "k13", "eplus"]) assert.ok(ids.includes(id), id);
  const rows = releaseRows(repo.standards, []);
  assert.equal(rows.length, 3);
});

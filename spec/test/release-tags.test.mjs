// The releases surface compares two tag series to the versions this
// repository ratified: AiEDs (v*) and E+ (eplus-v*). The comparison is a pure
// function in scripts/release-tags.mjs, so these tests feed it fixtures
// instead of the GitHub API.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { releaseRows, versionsForPrefix, compareSemver, RELEASE_SERIES } from "../../scripts/release-tags.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const standards = [
  { id: "eplus", semver: "1.2.1" },
  { id: "aieds", semver: "2.4.0" },
  { id: "ai-for-good", semver: null },
];
const byName = (rows, name) => rows.find((r) => r.name === name);

// AiEDs tags as they stood on 2026-10-15, before any E+ tag.
const TODAY = ["v1.0.0", "v1.1.0", "v2.0.0", "v2.3.1", "v2.4.0"];

test("AiEDs tags only: AiEDs ok, E+ UNTAGGED", () => {
  const rows = releaseRows(standards, TODAY);
  assert.equal(byName(rows, "AiEDs").state, "ok");
  assert.equal(byName(rows, "E+").state, "UNTAGGED");
  assert.equal(byName(rows, "E+").id, "eplus-v1.2.1");
});

test("the series do not read each other's tags, or any other prefix", () => {
  // v1.2.1 is not an E+ tag and eplus-v2.4.0 is not an AiEDs tag.
  assert.deepEqual(versionsForPrefix(["v1.2.1", "other-v1.2.1"], "eplus-v"), []);
  assert.deepEqual(versionsForPrefix(["eplus-v2.4.0", "other-v2.4.0"], "v"), []);
  const rows = releaseRows(standards, ["v1.2.1", "other-v1.2.1", "v2.4.0"]);
  assert.equal(byName(rows, "E+").state, "UNTAGGED");
  assert.equal(byName(rows, "AiEDs").state, "ok");
});

test("all current tags present is ok on every row", () => {
  const rows = releaseRows(standards, [...TODAY, "eplus-v1.2.1"]);
  assert.deepEqual(rows.map((r) => r.state), ["ok", "ok"]);
});

test("a series is BEHIND when its newest tag is older than the repo version", () => {
  const rows = releaseRows(standards, [...TODAY, "eplus-v1.1.0", "eplus-v1.2.0"]);
  const eplus = byName(rows, "E+");
  assert.equal(eplus.state, "BEHIND");
  assert.equal(eplus.live, "1.2.0");
});

test("newest is chosen numerically, not lexically", () => {
  const rows = releaseRows(
    [{ id: "eplus", semver: "1.10.0" }],
    ["eplus-v1.9.0", "eplus-v1.10.0", "eplus-v1.2.0"],
  );
  assert.equal(rows[0].live, "1.10.0");
  assert.equal(rows[0].state, "ok");
});

test("a tag newer than the checkout is ahead, which is not a failure", () => {
  const rows = releaseRows(standards, [...TODAY, "eplus-v1.3.0"]);
  assert.equal(byName(rows, "E+").state, "ahead");
});

test("the AiEDs row keeps the original exact-tag rule", () => {
  // Behind on AiEDs means the exact tag v2.4.0 is missing.
  const rows = releaseRows(standards, ["v1.0.0", "v2.3.1", "eplus-v1.2.1"]);
  const aieds = byName(rows, "AiEDs");
  assert.equal(aieds.id, "v2.4.0");
  assert.equal(aieds.state, "UNTAGGED");
  assert.equal(aieds.live, null);
  // A later AiEDs tag does not satisfy the exact rule either: unchanged.
  const later = releaseRows(standards, ["v2.5.0"]);
  assert.equal(byName(later, "AiEDs").state, "UNTAGGED");
});

test("pre-release and malformed tags are ignored", () => {
  assert.deepEqual(
    versionsForPrefix(["eplus-v1.2.1-rc1", "eplus-v1.2", "eplus-v1.2.1.1", "eplus-vX"], "eplus-v"),
    [],
  );
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

test("the standard-versions file defines the two series this check reads", () => {
  assert.deepEqual(RELEASE_SERIES.map((s) => s.id), ["aieds", "eplus"]);
  const repo = JSON.parse(readFileSync(join(repoRoot, "spec/v2/standard-versions.json"), "utf8"));
  const ids = repo.standards.map((s) => s.id);
  for (const id of ["aieds", "eplus"]) assert.ok(ids.includes(id), id);
  const rows = releaseRows(repo.standards, []);
  assert.equal(rows.length, 2);
});

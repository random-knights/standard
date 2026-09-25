// The publish path is a three-step manual sequence and skipping step one is
// invisible. These pin the two things that make that detectable, in the same
// way staging-deploy.test.mjs pins the staging workflow: by reading the files
// rather than trusting that they still say what they said.
//
// The incident: 2026-09-24, AiEDs 2.4.0 merged as PR #75, the owner ran
// `firebase deploy --only hosting:standard`, and the site kept serving 2.3.0.
// hosting:standard publishes .firebase/standard-site, a gitignored build
// output, so a deploy without scripts/build-site.mjs first re-ships the
// previous tree and exits 0.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repoRoot, p), "utf8");

const workflow = read(".github/workflows/85-published-drift.yml");
const publisher = read("scripts/publish-site.mjs");
const checker = read("scripts/check-published-site.mjs");
const pkg = JSON.parse(read("package.json"));

test("the drift workflow holds NO production credential", () => {
  // The whole reason this check can run on a schedule is that it reads a
  // public URL. The moment it needs the randomknights-xyz service account it
  // stops being a safe scheduled job and reverses the owner decision in
  // CONTRIBUTING.md that production has no release workflow here.
  assert.ok(!/secrets\./.test(workflow), "85-published-drift must reference no secret");
  assert.ok(!/FIREBASE_SERVICE_ACCOUNT/.test(workflow));
  assert.ok(!/randomknights-xyz/.test(workflow));
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
});

test("an unreachable site is not reported as drift", () => {
  // Exit 2 means "I could not look", exit 1 means "the site is stale". A
  // scheduled job that cries drift on every network blip gets muted, and then
  // it is not there on the day it matters.
  assert.match(workflow, /if \[ "\$code" = "2" \]/);
  assert.match(workflow, /::warning::/);
  assert.match(checker, /return 2;/);
});

test("the checker fails when a published version is behind, and only then", () => {
  assert.match(checker, /state === "BEHIND"/);
  // 'ahead' means this checkout is behind the site, which is not a site fault.
  assert.ok(
    !/r\.state === "ahead"/.test(
      checker.slice(checker.indexOf("const failing")),
    ),
    "'ahead' must not be a failing state",
  );
});

test("the publisher runs build before gate before deploy, and verifies after", () => {
  // Keyed on the numbered step labels, not on phrases like "hosting:standard"
  // that also appear in this file's header comment. The first version of this
  // test read the comment and failed on prose order, which is exactly the kind
  // of test that gets deleted rather than trusted.
  const steps = [...publisher.matchAll(/\b([1-4])\/4\s+([^"]+)/g)].map((m) => ({
    n: Number(m[1]),
    label: m[2].trim(),
    at: m.index,
  }));
  assert.deepEqual(
    steps.map((s) => s.n),
    [1, 2, 3, 4],
    "the four steps must appear once each, in order",
  );
  assert.match(steps[0].label, /Build/i);
  assert.match(steps[1].label, /Gate/i);
  assert.match(steps[2].label, /Deploy/i);
  assert.match(steps[3].label, /Verify/i);

  // And each step must actually invoke what its label claims.
  const body = publisher.slice(steps[0].at);
  const order = ["scripts/build-site.mjs", '"npm", ["test"]', "hosting:standard", "check-published-site.mjs"];
  let cursor = -1;
  for (const needle of order) {
    const at = body.indexOf(needle, cursor + 1);
    assert.ok(at > cursor, `${needle} must come after the previous step`);
    cursor = at;
  }
});

test("a failing step stops the sequence instead of deploying anyway", () => {
  assert.match(publisher, /Nothing after this step ran\. The site was not deployed\./);
  assert.match(publisher, /process\.exit\(res\.status \?\? 1\)/);
});

test("npm exposes both entry points, so neither is a remembered incantation", () => {
  assert.equal(pkg.scripts["publish:site"], "node scripts/publish-site.mjs");
  assert.equal(pkg.scripts["check:published"], "node scripts/check-published-site.mjs");
});

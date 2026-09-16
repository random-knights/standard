// STAGING LIVES IN randomknights-abc. PRODUCTION LIVES IN randomknights-xyz.
//
// This repo had no deploy path at all until this workflow. Pinned here so
// it cannot drift toward the production project or a second secret, the
// same invariant randomly and knightly carry in their own check scripts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const staging = readFileSync(
  resolve(repoRoot, ".github", "workflows", "80-staging-deploy.yml"),
  "utf8",
);
const firebaseJson = JSON.parse(
  readFileSync(resolve(repoRoot, "firebase.json"), "utf8"),
);
const firebaserc = JSON.parse(
  readFileSync(resolve(repoRoot, ".firebaserc"), "utf8"),
);

test("firebase.json exposes exactly the standard and staging targets", () => {
  assert.equal(firebaseJson.hosting.length, 2);
  assert.equal(firebaseJson.hosting[0].target, "standard");
  assert.equal(firebaseJson.hosting[1].target, "staging");
  assert.equal(firebaseJson.hosting[1].public, ".firebase/standard-site");
  assert.equal(firebaseJson.hosting[1].cleanUrls, true);
  assert.equal(firebaseJson.hosting[1].trailingSlash, false);
});

test("the staging hosting block carries the noindex header and keeps the schema content-type rule", () => {
  const staged = firebaseJson.hosting[1];
  const robots = staged.headers.find((rule) => rule.source === "**");
  assert.ok(robots, "staging must add a ** header rule");
  assert.equal(
    robots.headers.find((h) => h.key === "X-Robots-Tag")?.value,
    "noindex, nofollow",
  );
  const schemaRule = staged.headers.find((rule) => rule.source === "**/*.schema.json");
  assert.equal(
    schemaRule?.headers.find((h) => h.key === "Content-Type")?.value,
    "application/schema+json; charset=utf-8",
  );
});

test(".firebaserc maps standard to production and staging to abc, never crossed", () => {
  assert.deepEqual(firebaserc.targets["randomknights-xyz"].hosting, {
    standard: ["standard-rand0m-ai"],
  });
  assert.deepEqual(firebaserc.targets["randomknights-abc"].hosting, {
    staging: ["abc-standard-rand0m-ai"],
  });
});

test("the staging deploy targets the abc project and the abc credential", () => {
  assert.match(staging, /--project randomknights-abc/);
  assert.match(staging, /secrets\.FIREBASE_SERVICE_ACCOUNT_RANDOMKNIGHTS_ABC/);
  assert.match(staging, /STAGING_URL: https:\/\/abc-standard-rand0m-ai\.web\.app/);
  assert.match(staging, /--only hosting:staging/);
});

test("the staging deploy never deploys to the production project", () => {
  assert.doesNotMatch(staging, /--project randomknights-xyz/);
  assert.doesNotMatch(staging, /FIREBASE_SERVICE_ACCOUNT_RANDOMKNIGHTS_XYZ/);
  assert.doesNotMatch(staging, /--only hosting:standard/);
});

test("the missing-credential guard names the secret it actually reads", () => {
  assert.match(staging, /FIREBASE_SERVICE_ACCOUNT_RANDOMKNIGHTS_ABC is not available/);
});

test("merging to main deploys to staging", () => {
  assert.match(staging, /^\s+branches: \[main\]$/m);
  assert.match(staging, /^\s+workflow_dispatch:$/m);
});

test("the staging build runs the site-output gate before any deploy step", () => {
  const buildStepIndex = staging.indexOf("node scripts/build-site.mjs");
  const testStepIndex = staging.indexOf("cd spec && npm test");
  const deployStepIndex = staging.indexOf("deploy --only hosting:staging");
  assert.ok(buildStepIndex >= 0 && testStepIndex > buildStepIndex);
  assert.ok(deployStepIndex > testStepIndex);
});

test("the deploy proves the bytes it served, not the config it used", () => {
  assert.match(staging, /sha256sum -c/);
  assert.match(staging, /staging byte proof passed/);
  assert.match(staging, /createHash\('sha256'\)/);
  assert.match(staging, /contentType\.includes\('application\/schema\+json'\)/);
  assert.match(staging, /max-age=3600/);
  assert.match(staging, /robotsOk/);
});

test("the byte proof retries a failing file up to 6 times, 10 seconds apart, before reporting red", () => {
  assert.equal((staging.match(/MAX_ATTEMPTS = 6/g) || []).length, 1);
  assert.equal((staging.match(/RETRY_WAIT_MS = 10000/g) || []).length, 1);
  assert.match(staging, /if \(failures\.length\) throw new Error\(failures\.join\('\\n'\)\);/);
});

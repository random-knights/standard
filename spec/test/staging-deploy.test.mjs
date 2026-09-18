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
});

test("production still serves the built spec site itself", () => {
  // The tier RK-98 must not touch.
  const production = firebaseJson.hosting[0];
  assert.equal(production.public, ".firebase/standard-site");
  assert.equal(production.cleanUrls, true);
  assert.equal(production.trailingSlash, false);
  const schemaRule = production.headers.find((rule) => rule.source === "**/*.schema.json");
  assert.equal(
    schemaRule?.headers.find((h) => h.key === "Content-Type")?.value,
    "application/schema+json; charset=utf-8",
  );
  const robots = production.headers.flatMap((rule) => rule.headers)
    .filter((header) => header.key === "X-Robots-Tag");
  assert.equal(robots.length, 0, "production must never be marked noindex");
});

test("staging is a gate shim, so the spec draft is not readable by strangers", () => {
  // RK-98: staging serves nothing of its own. Every path is rewritten to the
  // stagingGate function, which reads the build from a private bucket and
  // hands it only to a verified internal session. Pointing this target back at
  // the built tree would republish unreleased spec text to anyone.
  const staged = firebaseJson.hosting[1];
  assert.equal(staged.public, "staging-shim");
  assert.notEqual(staged.public, ".firebase/standard-site");
  assert.deepEqual(staged.rewrites, [
    {
      source: "**",
      function: { functionId: "stagingGate", region: "us-central1" },
    },
  ]);
  const robots = staged.headers.find((rule) => rule.source === "**");
  assert.equal(
    robots?.headers.find((h) => h.key === "X-Robots-Tag")?.value,
    "noindex, nofollow",
  );
  // The gate sets Cache-Control private on every response; a public rule in
  // the shim would let the CDN hand a cached file to someone with no session.
  const cacheHeaders = staged.headers
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key === "Cache-Control");
  assert.equal(cacheHeaders.length, 0);
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

test("the staging deploy uploads to the private bucket, not to public hosting", () => {
  assert.match(staging, /STAGING_BUCKET: randomknights-abc-staging-private/);
  assert.match(staging, /SITE_PREFIX: standard/);
  assert.match(staging, /gcloud storage rsync --recursive --delete-unmatched-destination-objects/);
  assert.match(staging, /gs:\/\/\$STAGING_BUCKET\/\$SITE_PREFIX/);
});

test("the deploy proves the bytes it uploaded, not the config it used", () => {
  assert.match(staging, /gcloud storage cp --recursive/);
  assert.match(staging, /sha256sum -c/);
  assert.match(staging, /staging byte proof passed/);
});

test("the deploy proves the gate is closed on both staging hosts", () => {
  assert.match(staging, /STAGING_CUSTOM_URL: https:\/\/stg\.standard\.rand0m\.ai/);
  assert.match(staging, /rk-staging-gate-sign-in/);
  assert.match(staging, /served the site itself to an unauthenticated request/);
});

test("the gate proof retries a propagating host up to 6 times, 10 seconds apart", () => {
  assert.match(staging, /for attempt in 1 2 3 4 5 6/);
  assert.match(staging, /sleep 10/);
});

// Gate: the standard.rand0m.ai build derives its artifact paths from the
// schema's own $id, ships the artifacts byte-identical to their spec/
// sources, and never claims K13 is live before K13.md actually exists here.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const { expectedFiles } = await import(
  "file://" + resolve(repoRoot, "scripts/build-site.mjs")
);

const schema = JSON.parse(
  readFileSync(resolve(repoRoot, "spec/aieds.schema.json"), "utf8"),
);
const files = expectedFiles();

test("the AIEDS artifact directory matches the schema's own $id", () => {
  // The $id is https://standard.rand0m.ai/<dir>/aieds.schema.json. The build
  // must serve the schema at exactly that path relative to the site root, or
  // the identifier and the deployed location silently disagree.
  const url = new URL(schema.$id);
  const expectedPath = url.pathname.replace(/^\//, "");
  const actualPaths = [...files.keys()].map((k) => k.replaceAll("\\", "/"));
  assert.ok(
    actualPaths.includes(expectedPath),
    `expected an artifact at "${expectedPath}" (from $id ${schema.$id}), ` +
      `got: ${actualPaths.join(", ")}`,
  );
});

test("every shipped AIEDS artifact is byte-identical to its spec/ source", () => {
  const url = new URL(schema.$id);
  const dir = url.pathname.replace(/^\//, "").replace(/\/[^/]+$/, "");
  const pairs = [
    [`${dir}/aieds.schema.json`, "spec/aieds.schema.json"],
    [`${dir}/methodology.md`, "spec/methodology.md"],
    [`${dir}/aieds-factors.json`, "spec/v2/aieds-factors.json"],
  ];
  for (const [servedPath, sourcePath] of pairs) {
    const key = [...files.keys()].find(
      (k) => k.replaceAll("\\", "/") === servedPath,
    );
    assert.ok(key, `no output file for ${servedPath}`);
    const served = files.get(key);
    const source = readFileSync(resolve(repoRoot, sourcePath));
    assert.ok(
      served.equals(source),
      `${servedPath} differs from ${sourcePath}; the build must copy ` +
        `bytes verbatim, never re-derive them`,
    );
  }
});

test("the index page lists AIEDS as live and K13 as not yet published", () => {
  const indexKey = [...files.keys()].find((k) => k === "index.html");
  const html = files.get(indexKey).toString("utf8");

  // AIEDS: real links, real license tags, a pointer to read on xyz.
  assert.match(html, /AI Energy Disclosure Standard/);
  assert.match(html, new RegExp(schema.$id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Apache 2\.0/);
  assert.match(html, /randomknights\.xyz\/aieds\//);

  // K13: present, but every claim about it says "not yet". This is a honesty
  // gate, not a style gate: a future edit that quietly marks K13 live before
  // K13.md exists in this repo should fail loudly here.
  assert.match(html, />K13</);
  assert.match(html, /not yet published/);
  assert.match(html, /has not moved in yet|not yet moved in/);
  assert.doesNotMatch(
    html,
    /standard\.rand0m\.ai\/k13\//,
    "K13 must not get a resolving standard.rand0m.ai artifact link until " +
      "K13.md actually exists in this repository",
  );
});

test("chrome values match rk_branding/canon/site-canon.md verbatim", () => {
  // Pinned by literal, read from the ratified canon at authoring time
  // (2026-08-24, glow ratified 2026-08-26), not re-derived from a screenshot.
  // A canon update means updating this test deliberately, not silently.
  const indexKey = [...files.keys()].find((k) => k === "index.html");
  const html = files.get(indexKey).toString("utf8");

  assert.match(
    html,
    /radial-gradient\(66% 60% at 50% 36%, transparent 89%, rgba\(255, 104, 54, 0\.24\) 100%\)/,
    "edge glow must be the ratified 2026-08-26 single-radial ramp",
  );
  assert.match(
    html,
    /repeating-linear-gradient\(90deg, rgba\(255, 124, 72, 0\.18\) 0 1px, transparent 1px 58px\)/,
    "desktop grid vertical lines",
  );
  for (const hex of ["#faafa5", "#e97862", "#f45d43", "#ff4124"]) {
    assert.ok(html.includes(hex), `missing family footer color ${hex}`);
  }
});

test("build output is ASCII; family marks are numeric entities, not literals", () => {
  const indexKey = [...files.keys()].find((k) => k === "index.html");
  const html = files.get(indexKey).toString("utf8");
  const bad = [...html].filter((c) => c.charCodeAt(0) > 127);
  assert.equal(bad.length, 0, `non-ASCII in rendered output: ${bad.join(" ")}`);
  assert.match(html, /&#7450;k\.xyz/, "the U+1D1A mark must render via entity");
});

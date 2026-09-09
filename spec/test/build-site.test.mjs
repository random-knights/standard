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

test("the AiEDs artifact directory matches the schema's own $id", () => {
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

test("every shipped AiEDs artifact is byte-identical to its spec/ source", () => {
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

test("the index page lists AiEDs as live and K13.md as published", () => {
  const indexKey = [...files.keys()].find((k) => k === "index.html");
  const html = files.get(indexKey).toString("utf8");

  // AiEDs: real links, real license tags, a pointer to read on xyz.
  assert.match(html, /AI Energy Disclosure Standard/);
  assert.match(html, new RegExp(schema.$id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Apache 2\.0/);
  assert.match(html, /randomknights\.xyz\/aieds\//);

  // K13: K13.md is in this repository, so the index links to the served copy
  // and the build ships it byte-identical. This is a honesty gate, not a
  // style gate: it fails if K13.md is removed while the page still claims it.
  assert.match(html, />K13</);
  assert.match(html, /standard\.rand0m\.ai\/k13\/v1\/K13\.md/);
  const k13Key = [...files.keys()].find(
    (k) => k.replaceAll("\\", "/") === "k13/v1/K13.md",
  );
  assert.ok(k13Key, "no output file for k13/v1/K13.md");
  assert.ok(
    files.get(k13Key).equals(readFileSync(resolve(repoRoot, "K13.md"))),
    "k13/v1/K13.md differs from K13.md; the build must copy bytes verbatim",
  );
});

test("the index page still says the K13 level registry is not yet published", () => {
  // canon/k13-levels.json has not moved in. The page must say so rather than
  // link to a path that 404s; this flips deliberately when the registry lands.
  const indexKey = [...files.keys()].find((k) => k === "index.html");
  const html = files.get(indexKey).toString("utf8");
  assert.match(html, /not yet published/);
  assert.match(html, /level registry/);
  assert.doesNotMatch(html, /standard\.rand0m\.ai\/k13\/v1\/k13-levels\.json/);
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

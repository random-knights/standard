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

const { PROPERTY_NAME, PROPERTY_NAME_HTML, expectedFiles } = await import(
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

test("the index page lists E+ at the version and status its own text declares", () => {
  // Same honesty gate as K13: the served copy is byte-identical to the repo
  // file, the version on the page is parsed from the document header, and a
  // draft is labeled as a draft until the text itself says otherwise.
  const indexKey = [...files.keys()].find((k) => k === "index.html");
  const html = files.get(indexKey).toString("utf8");
  const source = readFileSync(resolve(repoRoot, "eplus/v1/methodology.md"), "utf8");
  const version = source.match(/\*\*Version:\*\*\s*([\d.]+)/)[1];
  const status = source.match(/\*\*Status:\*\*\s*([^\n]+)/)[1].trim();

  assert.match(html, /E\+ Earth Health Score/);
  assert.match(html, /standard\.rand0m\.ai\/eplus\/v1\/methodology\.md/);
  assert.ok(html.includes(`methodology ${version}`), `index must show E+ ${version}`);
  assert.ok(html.includes(status), `index must carry the E+ status line: ${status}`);

  const eplusKey = [...files.keys()].find(
    (k) => k.replaceAll("\\", "/") === "eplus/v1/methodology.md",
  );
  assert.ok(eplusKey, "no output file for eplus/v1/methodology.md");
  assert.ok(
    files.get(eplusKey).equals(readFileSync(resolve(repoRoot, "eplus/v1/methodology.md"))),
    "eplus/v1/methodology.md differs from its source; the build must copy bytes verbatim",
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

test("one brand name, and its brand character is U+1D1A", () => {
  // Owner decision 2026-09-23: one name per property, on the title, the
  // visible h1 and the installable manifest. Before this the three read
  // standard.rand0m.ai, which is the host, not a name.
  const html = files.get("index.html").toString("utf8");
  assert.ok(html.includes(`<title>${PROPERTY_NAME_HTML}</title>`));
  assert.ok(html.includes(`<h1>${PROPERTY_NAME_HTML}</h1>`));
  const manifest = JSON.parse(files.get("site.webmanifest").toString("utf8"));
  assert.equal(manifest.name, PROPERTY_NAME);
  // short_name stays short because a phone truncates it under the icon.
  assert.equal(manifest.short_name, "standard");
  // The property name is PLAIN ASCII. This assertion was inverted on
  // 2026-09-23: it used to require exactly one U+1D1A, because the name was
  // the bracketed form. Google brand verification rejected the bracketed
  // letters, so the App Titles list replaced them with plain words and the
  // name must now carry no block form and no brand character at all. The
  // family footer marks still ship U+1D1A as a numeric reference and are
  // pinned above by the "&#7450;k.xyz" assertion.
  const exotic = [...PROPERTY_NAME]
    .map((character) => character.codePointAt(0))
    .filter((point) => point > 0x7f);
  assert.deepEqual(exotic, []);
  // Both forms are the same pure-ASCII string, so the HTML form needs no
  // entity. Decoding it is still a no-op and must still round-trip.
  assert.equal(
    PROPERTY_NAME_HTML.replace(/&#(\d+);/g, (_, point) => String.fromCodePoint(Number(point))),
    PROPERTY_NAME,
  );
});

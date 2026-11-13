// Gate: the standard.rand0m.ai build derives its artifact paths from the
// schema's own $id and ships the artifacts byte-identical to their spec/
// sources.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const { PROPERTY_NAME, PROPERTY_NAME_HTML, RETIRED_NOTICE_PATH, expectedFiles } = await import(
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

test("the index page lists AiEDs as live", () => {
  const indexKey = [...files.keys()].find((k) => k === "index.html");
  const html = files.get(indexKey).toString("utf8");

  // AiEDs: real links, real license tags, a pointer to read on xyz.
  assert.match(html, /AI Energy Disclosure Standard/);
  assert.match(html, new RegExp(schema.$id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Apache 2\.0/);
  assert.match(html, /randomknights\.xyz\/aieds\//);
});

test("the index page lists E+ at the version and status its own text declares", () => {
  // An honesty gate: the served copy is byte-identical to the repo file, the
  // version on the page is parsed from the document header, and a draft is
  // labeled as a draft until the text itself says otherwise.
  const indexKey = [...files.keys()].find((k) => k === "index.html");
  const html = files.get(indexKey).toString("utf8");
  const source = readFileSync(resolve(repoRoot, "eplus/v1/methodology.md"), "utf8");
  const version = source.match(/\*\*Version:\*\*\s*([\d.]+)/)[1];
  const status = source.match(/\*\*Status:\*\*\s*([^\n]+)/)[1].trim();

  assert.match(html, /E\+ Earth \+ Ai Impact Standard/);
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

// TEMPORARY: delete this test with the notice it checks, on or after
// 2027-02-01 (see RETIRED_NOTICE_PATH in scripts/build-site.mjs).
test("the retired standard's old address serves one short notice and nothing else", () => {
  const keys = [...files.keys()].map((k) => k.replaceAll("\\", "/"));
  const oldDir = RETIRED_NOTICE_PATH.split("/")[0] + "/";
  assert.deepEqual(
    keys.filter((k) => k.startsWith(oldDir)),
    [RETIRED_NOTICE_PATH],
    `${oldDir} must hold the one notice page only`,
  );
  const notice = files.get(RETIRED_NOTICE_PATH).toString("utf8");
  assert.match(notice, /has been retired as a standard/);
  assert.match(notice, /href="https:\/\/randomknights\.xyz\/aieds\/"/);
  assert.match(notice, /href="https:\/\/randomknights\.xyz\/earth\/"/);
  assert.ok(!notice.includes("randomknights.xyz/eplus/"), "that address answers 404");
  assert.deepEqual([...notice].filter((c) => c.charCodeAt(0) > 127), []);
  // The index page links only to the standards that continue.
  const html = files.get("index.html").toString("utf8");
  assert.ok(!html.includes(oldDir), `the index page must not link into ${oldDir}`);
});

test("the index page links Earth+ to its live home, never the 404 /eplus/ address", () => {
  const html = files.get("index.html").toString("utf8");
  assert.ok(!html.includes("randomknights.xyz/eplus/"), "randomknights.xyz/eplus/ answers 404");
  assert.match(html, /href="https:\/\/randomknights\.xyz\/earth\/"/);
});

test("the index page declares a canonical URL and a theme color matching its background", () => {
  const html = files.get("index.html").toString("utf8");
  assert.match(html, /<link rel="canonical" href="https:\/\/standard\.rand0m\.ai\/">/);
  const theme = html.match(/<meta name="theme-color" content="(#[0-9a-f]{6})">/);
  assert.ok(theme, "missing theme-color meta");
  assert.ok(
    html.includes(`background: ${theme[1]};`),
    "theme-color must equal the color the body paints",
  );
});

test("sitemap.xml lists only public pages that the build really serves, and robots.txt points at it", () => {
  const sitemap = files.get("sitemap.xml").toString("utf8");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.includes("https://standard.rand0m.ai/"));
  assert.ok(locs.length >= 3, "home plus one methodology per standard");
  const served = new Set([...files.keys()].map((k) => k.replaceAll("\\", "/")));
  for (const loc of locs) {
    const url = new URL(loc);
    assert.equal(url.origin, "https://standard.rand0m.ai");
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    assert.ok(served.has(path), `sitemap lists ${loc} but the build does not serve ${path}`);
  }
  assert.ok(!locs.some((l) => l.includes("/k13/")), "the retired notice is not a destination");
  assert.deepEqual([...sitemap].filter((c) => c.charCodeAt(0) > 127), []);
  const robots = files.get("robots.txt").toString("utf8");
  assert.match(robots, /^Sitemap: https:\/\/standard\.rand0m\.ai\/sitemap\.xml$/m);
  assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots), "production must stay crawlable");
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

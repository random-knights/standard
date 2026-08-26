// Gate: spec/v2/aieds-factors.json IS methodology.md, mechanically.
//
// WHY THIS EXISTS. Before this file there were five copies of AIEDS coefficient
// data (the Dart app model, the TypeScript reference library, the MCP factor
// tables, methodology.md section 2.4 prose, and methodology.md section 4
// tables) and nothing compared any of them. That is the exact condition that
// let the Mature Reference Tree sit at 22 kg in published documents for a month
// after 2.0.0 unified it at 21 kg.
//
// The published JSON is now canonical. This test proves the ratified prose in
// methodology.md still says the same numbers. It reads the document, not a
// summary of it. If a table row is edited on one side only, this fails and
// names the value.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const factors = JSON.parse(
  readFileSync(resolve(here, "../v2/aieds-factors.json"), "utf8"),
);
const doc = readFileSync(resolve(here, "../methodology.md"), "utf8");

const norm = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const num = (s) => Number(norm(s).replace(/[\s,]/g, ""));

// Slice one markdown table out of the document. Stops at the next heading of
// any level or a horizontal rule, so Table 3 does not swallow section 5.
function tableRows(heading) {
  const start = doc.indexOf(heading);
  assert.ok(start >= 0, `methodology.md no longer contains "${heading}"`);
  const rest = doc.slice(start);
  const stops = ["\n### ", "\n## ", "\n---"]
    .map((s) => rest.indexOf(s, heading.length))
    .filter((i) => i >= 0);
  const body = rest.slice(0, stops.length ? Math.min(...stops) : rest.length);
  const rows = body
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) =>
      l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(norm),
    )
    .filter((cells) => !/^[-: ]+$/.test(cells[0]));
  assert.ok(
    rows.length > 1,
    `no table found under "${heading}"; the document shape changed and this ` +
      `gate can no longer see it`,
  );
  return rows.slice(1); // drop the header row
}

test("Table 1 hardware TDP matches the published table", () => {
  const rows = tableRows("### Table 1");
  const published = new Map(
    factors.computePaths.hardwareTdp.entries.map((e) => [e.label, e]),
  );
  assert.equal(rows.length, published.size, "hardware entry count differs");
  for (const [label, tdp, source] of rows) {
    const e = published.get(label);
    assert.ok(e, `methodology.md Table 1 has "${label}", the JSON does not`);
    assert.equal(e.powerW, num(tdp), `${label} TDP`);
    assert.equal(e.source, source, `${label} source`);
  }
  const docDefault = Number(
    doc.match(/Default \(unknown hardware\):\s*\*\*(\d+)\s*W\*\*/)[1],
  );
  assert.equal(factors.computePaths.hardwareTdp.defaultPowerW, docDefault);
});

test("Table 2 token proxy matches the published table", () => {
  const rows = tableRows("### Table 2");
  const published = new Map(
    factors.computePaths.tokenProxy.entries.map((e) => [e.scale, e]),
  );
  assert.equal(rows.length, published.size, "token proxy entry count differs");
  for (const [scale, , wh] of rows) {
    const e = published.get(scale);
    assert.ok(e, `methodology.md Table 2 has "${scale}", the JSON does not`);
    assert.equal(e.whPerMillionTokens, num(wh), `${scale} Wh per 1M tokens`);
  }
  // The default scale must name a row that exists, not a fourth value. The v1
  // code carried a `default: 500` key with no counterpart row in Table 2; that
  // is now an alias for `medium` rather than an independent number.
  assert.ok(
    published.has(factors.computePaths.tokenProxy.defaultScale),
    "defaultScale must name a row present in Table 2",
  );
});

test("Table 3 grid intensity matches the published table", () => {
  const rows = tableRows("### Table 3");
  const published = new Map(
    factors.computePaths.gridByRegion.entries.map((e) => [e.region, e]),
  );
  assert.equal(rows.length, published.size, "grid region count differs");
  for (const [region, value, source] of rows) {
    const e = published.get(region);
    assert.ok(e, `methodology.md Table 3 has "${region}", the JSON does not`);
    assert.equal(e.gCO2ePerKWh, num(value), `${region} gCO2e/kWh`);
    assert.equal(e.source, source, `${region} source`);
  }
  assert.ok(
    published.has(factors.computePaths.gridByRegion.defaultRegion),
    "defaultRegion must name a row present in Table 3",
  );
});

test("section 2.2 J/TFLOP matches the published constant", () => {
  const docValue = Number(doc.match(/J_per_TFLOP\s*=\s*([\d.]+)/)[1]);
  assert.equal(factors.computePaths.flop.joulesPerTflop, docValue);
});

test("section 2.4 reference coefficients match the published profiles", () => {
  // The ratified prose states the coefficients inline. Parsed by shape so an
  // edit to either side is caught. If this regex stops matching, the sentence
  // was reworded and this gate needs updating deliberately, not deleting.
  const expectations = [
    ["gemini", /gemini\s+([\d.]+)\/([\d.]+)\s+Wh per 1k in\/out,\s*PUE\s*([\d.]+),\s*([a-z-]+)/],
    ["gpt", /gpt\/o\*\s+([\d.]+)\/([\d.]+),\s*PUE\s*([\d.]+),\s*([a-z-]+)/],
    ["claude", /claude\s+([\d.]+)\/([\d.]+),\s*PUE\s*([\d.]+),\s*([a-z-]+)/],
  ];
  const flat = norm(doc);
  for (const [prefix, re] of expectations) {
    const m = flat.match(re);
    assert.ok(
      m,
      `methodology.md section 2.4 no longer states the ${prefix} coefficients ` +
        `in the expected shape; this gate can no longer see them`,
    );
    const p = factors.responseSurface.profiles.find((x) =>
      x.matchPrefixes.includes(prefix),
    );
    assert.ok(p, `no published profile for ${prefix}`);
    assert.equal(p.whPer1kIn, Number(m[1]), `${prefix} whPer1kIn`);
    assert.equal(p.whPer1kOut, Number(m[2]), `${prefix} whPer1kOut`);
    assert.equal(p.pue, Number(m[3]), `${prefix} pue`);
    assert.equal(p.confidence, m[4], `${prefix} confidence tier`);
  }
});

test("the two grid values stay distinct and correctly scoped", () => {
  const pinned = factors.gridIntensity.responseSurfacePinned;
  const table = factors.gridIntensity.tableGlobalAverage;

  // Methodology 2.4 documents the split deliberately. Collapsing it here would
  // be an unratified methodology change, so the gate refuses it in both
  // directions: they must differ, and each must keep its own section.
  assert.notEqual(
    pinned.value,
    table.value,
    "429 and 436 were unified without a methodology bump; section 2.4 " +
      "documents them as deliberately distinct",
  );
  assert.equal(pinned.methodologySection, "2.4");
  assert.match(table.methodologySection, /Table 3/);

  const docPinned = Number(
    norm(doc).match(/`(\d+) gCO.?2?e\/kWh` is the \*\*pinned app-surface/)[1],
  );
  assert.equal(pinned.value, docPinned, "pinned value differs from section 2.4");

  const tableRow = factors.computePaths.gridByRegion.entries.find(
    (e) => e.region === "global_average",
  );
  assert.equal(
    table.value,
    tableRow.gCO2ePerKWh,
    "tableGlobalAverage must equal the global_average row in Table 3",
  );
  assert.equal(table.citation, tableRow.source);
});

test("the honesty contract holds: every coefficient carries provenance", () => {
  const tiers = factors.responseSurface.confidenceTiers;
  const all = [
    ...factors.responseSurface.profiles,
    factors.responseSurface.unknownProfile,
  ];
  for (const p of all) {
    const who = p.matchPrefixes[0] ?? "(unmatched fallback)";
    assert.ok(tiers.includes(p.confidence), `${who}: unknown confidence tier`);
    assert.ok(
      typeof p.citation === "string" && p.citation.trim().length > 0,
      `${who}: a coefficient without a citation does not belong in the table`,
    );
    assert.ok(p.whPer1kOut > p.whPer1kIn, `${who}: output must cost more than input`);
    assert.ok(p.pue >= 1, `${who}: PUE below 1 is not physical`);
  }
  assert.equal(
    factors.responseSurface.unknownProfile.confidence,
    "unknown",
    "the fallback must never be silently confident",
  );

  // 429 is honest about having no citation. That is the point: it is labeled a
  // project modeled constant rather than given a source that does not support
  // it. Every OTHER number must be cited.
  assert.equal(factors.gridIntensity.responseSurfacePinned.citation, null);
  assert.equal(
    factors.gridIntensity.responseSurfacePinned.provenance,
    "project-modeled-constant",
  );
  assert.ok(factors.gridIntensity.tableGlobalAverage.citation.length > 0);
  for (const e of factors.computePaths.hardwareTdp.entries) {
    assert.ok(e.source.length > 0, `${e.label} has no source`);
  }
  for (const e of factors.computePaths.gridByRegion.entries) {
    assert.ok(e.source.length > 0, `${e.region} has no source`);
  }
});

test("the published table declares the methodology it belongs to", () => {
  const docVersion = doc.match(/\*\*Version:\*\*\s*([\d.]+)/)[1];
  assert.equal(
    factors.methodologyVersion,
    docVersion,
    "aieds-factors.json and methodology.md disagree about the current version",
  );
  assert.equal(factors.impactModelVersion, "v2");
});

test("the published table is ASCII", () => {
  const raw = readFileSync(resolve(here, "../v2/aieds-factors.json"), "utf8");
  const bad = [...raw].filter((c) => c.charCodeAt(0) > 127);
  assert.equal(
    bad.length,
    0,
    `non-ASCII in the published table: ${[...new Set(bad)].join(" ")}`,
  );
});

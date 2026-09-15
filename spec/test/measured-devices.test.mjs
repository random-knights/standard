// Gate: Table 4 of methodology.md IS the measuredDevices block of
// spec/v2/aieds-factors.json, mechanically, and every measured entry carries
// what a FITTED measurement has to carry.
//
// This is the same gate factors.test.mjs applies to Tables 1 to 3, for the same
// reason: the published JSON is canonical, the ratified prose must still say
// the same numbers, and nothing else compares them.
//
// It also enforces the rules that are specific to a two-term MEASURED
// coefficient and have no counterpart in the class-estimated tables:
//
//   1. THE SCOPE FENCE. A measured device coefficient describes the hardware,
//      runtime, model and quantization it names and nothing else. The normative
//      sentence must be present in methodology.md and the same fence must be
//      carried in the JSON, because a consumer reading only the JSON must not
//      be able to miss it.
//   2. EVERY TERM HAS AN INTERVAL. `a` and `b` are estimates. An estimate
//      published without its interval is the defect OQ-10 names.
//   3. A MIS-SPECIFIED FIT IS NOT PUBLISHED. If the curvature test is
//      significant, the entry is unresolved and must NOT appear in Table 4.
//      A straight line through a curve has whatever intercept it needs at zero
//      tokens, and calling that a fixed per-request cost is a false claim.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const factors = JSON.parse(
  readFileSync(resolve(here, "../v2/aieds-factors.json"), "utf8"),
);
const doc = readFileSync(resolve(here, "../methodology.md"), "utf8");

// Built from a code point, not written as a literal: this file is itself walked
// by the ASCII gate in test/ascii.test.mjs.
const NBSP = String.fromCharCode(0x00a0);
const norm = (s) => s.split(NBSP).join(" ").replace(/\s+/g, " ").trim();
const num = (s) => Number(norm(s).replace(/[\s,]/g, ""));

function tableRows(heading) {
  const start = doc.indexOf(heading);
  assert.ok(start >= 0, `methodology.md no longer contains "${heading}"`);
  const rest = doc.slice(start);
  const stops = ["\n### ", "\n#### ", "\n## ", "\n---"]
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
  return rows.slice(1);
}

/** Parses "value (lo to hi)" into [value, lo, hi]. */
function valueWithInterval(cell, label) {
  const m = norm(cell).match(
    /^(-?[\d.]+)\s*\((-?[\d.]+)\s+to\s+(-?[\d.]+)\)$/,
  );
  assert.ok(m, `${label}: cell must read "<value> (<lo> to <hi>)", got "${cell}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const PHASES = ["prefill", "decode"];

test("the measured-device block exists and declares its model and section", () => {
  const md = factors.measuredDevices;
  assert.ok(md, "spec/v2/aieds-factors.json has no measuredDevices block");
  assert.match(md.methodologySection, /Table 4/);
  assert.equal(md.unit, "a in Wh per request, b in Wh per token");
  assert.match(md.model, /energyWh = a \+ b \* tokens/);
  assert.ok(Array.isArray(md.entries) && md.entries.length > 0);
});

test("the scope fence is normative in the document and carried in the data", () => {
  const fence =
    "A measured device coefficient describes only the hardware, runtime, " +
    "model and quantization it names. It MUST NOT be applied to any other " +
    "system, and in particular MUST NOT be applied to hosted inference.";
  assert.ok(
    norm(doc).includes(norm(fence)),
    "methodology.md no longer states the measured-device scope fence verbatim",
  );
  assert.ok(
    norm(factors.measuredDevices.scopeFence).includes(norm(fence)),
    "aieds-factors.json measuredDevices.scopeFence no longer carries the fence",
  );
});

test("every measured entry carries what a measurement has to carry", () => {
  for (const e of factors.measuredDevices.entries) {
    const who = e.id ?? "(unidentified entry)";
    for (const field of [
      "id",
      "hardware",
      "acceleratorDriver",
      "hostCpu",
      "os",
      "runtime",
      "model",
      "parameters",
      "quantization",
      "contextLength",
      "measurementScope",
      "instrumentAccuracy",
      "samplingIntervalMs",
      "idleBaselineW",
      "citation",
      "measurementDirectory",
      "measurementCommit",
    ]) {
      const v = e[field];
      assert.ok(
        typeof v === "string" || typeof v === "number",
        `${who}: missing ${field}; a measurement without it is not citable`,
      );
      if (typeof v === "string") {
        assert.ok(v.trim().length > 0, `${who}: ${field} is empty`);
      }
    }
    assert.equal(e.provenance, "measured", `${who}: provenance`);
    assert.equal(e.confidence, "high", `${who}: confidence`);
    assert.equal(e.batchSize, 1, `${who}: batch size`);
    assert.match(
      e.measurementScope,
      /NOT measured/,
      `${who}: measurementScope must say what was not measured`,
    );
    assert.match(
      e.instrumentAccuracy,
      /accurate to within/,
      `${who}: instrumentAccuracy must state the instrument's own accuracy`,
    );
    assert.match(
      e.measurementCommit,
      /^[0-9a-f]{40}$/,
      `${who}: measurementCommit must be a full sha; a citation to a moving ` +
        `directory is not a citation`,
    );
    assert.ok(
      existsSync(resolve(here, "..", e.measurementDirectory.replace(/^spec\//, ""))),
      `${who}: measurementDirectory ${e.measurementDirectory} is not in this repository`,
    );
    for (const phase of PHASES) {
      assert.ok(e.phases?.[phase], `${who}: no ${phase} block`);
      assert.ok(
        ["published", "unresolved"].includes(e.phases[phase].status),
        `${who} ${phase}: status must be published or unresolved`,
      );
    }
  }
});

test("every fitted phase publishes its design and its residual check", () => {
  for (const e of factors.measuredDevices.entries) {
    for (const phase of PHASES) {
      const p = e.phases[phase];
      const who = `${e.id} ${phase}`;
      assert.ok(p.runs >= 30, `${who}: ${p.runs} runs; a fit needs at least 30`);
      assert.equal(p.degreesOfFreedom, p.runs - 2, `${who}: df`);
      assert.ok(Number.isFinite(p.r2), `${who}: r2`);
      assert.ok(
        Number.isFinite(p.residualStandardErrorJoules),
        `${who}: residual standard error`,
      );
      assert.equal(
        typeof p.curvatureSignificant,
        "boolean",
        `${who}: the curvature test must be reported either way`,
      );
      assert.ok(Number.isFinite(p.curvaturePValue), `${who}: curvature p value`);
      assert.match(p.method, /ordinary least squares/, `${who}: method`);
    }
  }
});

test("a mis-specified fit is unresolved, and an unresolved phase carries no coefficient", () => {
  for (const e of factors.measuredDevices.entries) {
    for (const phase of PHASES) {
      const p = e.phases[phase];
      const who = `${e.id} ${phase}`;
      if (p.curvatureSignificant) {
        assert.equal(
          p.status,
          "unresolved",
          `${who}: the curvature test is significant, so the affine model is ` +
            `mis-specified and this phase MUST NOT be published`,
        );
      }
      if (p.status === "unresolved") {
        assert.equal(p.aWhPerRequest, undefined, `${who}: unresolved but has a`);
        assert.equal(p.bWhPerToken, undefined, `${who}: unresolved but has b`);
        assert.ok(
          typeof p.reason === "string" && p.reason.trim().length > 0,
          `${who}: an unresolved phase must say why`,
        );
        // Unresolved and not-applicable are different claims and the
        // distinction must be stated, never used to soften the harder one.
        assert.match(
          p.unresolvedNotApplicable,
          /UNRESOLVED, not NOT-APPLICABLE/,
          `${who}: say which of the two this is`,
        );
      }
    }
  }
});

test("every published term carries an interval, by two methods", () => {
  for (const e of factors.measuredDevices.entries) {
    for (const phase of PHASES) {
      const p = e.phases[phase];
      if (p.status !== "published") continue;
      const who = `${e.id} ${phase}`;
      for (const [value, ci] of [
        [p.aWhPerRequest, p.aWhPerRequestCI95],
        [p.bWhPerToken, p.bWhPerTokenCI95],
        [p.bWhPerMillionTokens, p.bWhPerMillionTokensCI95],
      ]) {
        assert.ok(Number.isFinite(value), `${who}: a published term must be a number`);
        assert.ok(Array.isArray(ci) && ci.length === 2, `${who}: interval must be [lo, hi]`);
        assert.ok(ci[0] <= value && value <= ci[1], `${who}: estimate outside its own interval`);
      }
      // b is a cost. A negative marginal per-token cost is not physical, and a
      // b whose interval straddles zero would mean tokens might be free.
      assert.ok(p.bWhPerToken > 0, `${who}: marginal per-token cost must be positive`);
      assert.ok(
        p.bWhPerTokenCI95[0] > 0,
        `${who}: b's interval must exclude zero, or the phase has no ` +
          `demonstrated per-token cost at all`,
      );
      // The bootstrap is the cross-check. It must be present and it must be
      // reproducible, which means its seed and resample count are published.
      assert.ok(Array.isArray(p.bootstrapAWhPerRequestCI95), `${who}: bootstrap a interval`);
      assert.ok(Array.isArray(p.bootstrapBWhPerTokenCI95), `${who}: bootstrap b interval`);
      assert.ok(p.bootstrapResamples >= 1000, `${who}: bootstrap resamples`);
      assert.ok(Number.isInteger(p.bootstrapSeed), `${who}: bootstrap seed must be published`);
      // Whether the fixed cost is real is a claim, so it is stated explicitly
      // rather than left to a reader comparing an interval to zero by eye.
      assert.equal(
        typeof p.aDistinguishableFromZero,
        "boolean",
        `${who}: say whether a is distinguishable from zero`,
      );
      const straddlesZero = p.aWhPerRequestCI95[0] <= 0 && 0 <= p.aWhPerRequestCI95[1];
      assert.equal(
        p.aDistinguishableFromZero,
        !straddlesZero,
        `${who}: aDistinguishableFromZero disagrees with its own interval`,
      );
    }
  }
});

test("Table 4 in methodology.md matches the published measured entries", () => {
  const rows = tableRows("### Table 4");
  const expected = [];
  for (const e of factors.measuredDevices.entries) {
    for (const phase of PHASES) {
      const p = e.phases[phase];
      if (p.status !== "published") continue;
      expected.push({
        hardware: e.hardware,
        runtime: e.runtime,
        model: e.model,
        quantization: e.quantization,
        phase,
        a: p.aWhPerRequest,
        aCI: p.aWhPerRequestCI95,
        b: p.bWhPerMillionTokens,
        bCI: p.bWhPerMillionTokensCI95,
        runs: p.runs,
      });
    }
  }
  assert.equal(rows.length, expected.length, "Table 4 row count differs");
  rows.forEach((cells, i) => {
    const [hardware, runtime, model, quantization, phase, aCell, bCell, runsCell] = cells;
    const e = expected[i];
    assert.equal(hardware, e.hardware, `Table 4 row ${i + 1} hardware`);
    assert.equal(runtime, e.runtime, `Table 4 row ${i + 1} runtime`);
    assert.equal(model, e.model, `Table 4 row ${i + 1} model`);
    assert.equal(quantization, e.quantization, `Table 4 row ${i + 1} quantization`);
    assert.equal(phase, e.phase, `Table 4 row ${i + 1} phase`);
    const [a, aLo, aHi] = valueWithInterval(aCell, `Table 4 row ${i + 1} a`);
    assert.equal(a, e.a, `Table 4 row ${i + 1} a`);
    assert.equal(aLo, e.aCI[0], `Table 4 row ${i + 1} a lower bound`);
    assert.equal(aHi, e.aCI[1], `Table 4 row ${i + 1} a upper bound`);
    const [b, bLo, bHi] = valueWithInterval(bCell, `Table 4 row ${i + 1} b`);
    assert.equal(b, e.b, `Table 4 row ${i + 1} b`);
    assert.equal(bLo, e.bCI[0], `Table 4 row ${i + 1} b lower bound`);
    assert.equal(bHi, e.bCI[1], `Table 4 row ${i + 1} b upper bound`);
    assert.equal(num(runsCell), e.runs, `Table 4 row ${i + 1} runs`);
  });
});

test("the unresolved list names every unpublished phase, and only those", () => {
  const rows = tableRows("#### Table 4 unresolved");
  const expected = [];
  for (const e of factors.measuredDevices.entries) {
    for (const phase of PHASES) {
      if (e.phases[phase].status === "published") continue;
      expected.push({
        hardware: e.hardware,
        model: e.model,
        quantization: e.quantization,
        phase,
        runs: e.phases[phase].runs,
      });
    }
  }
  assert.equal(rows.length, expected.length, "unresolved row count differs");
  rows.forEach((cells, i) => {
    const [hardware, model, quantization, phase, runsCell] = cells;
    const e = expected[i];
    assert.equal(hardware, e.hardware, `unresolved row ${i + 1} hardware`);
    assert.equal(model, e.model, `unresolved row ${i + 1} model`);
    assert.equal(quantization, e.quantization, `unresolved row ${i + 1} quantization`);
    assert.equal(phase, e.phase, `unresolved row ${i + 1} phase`);
    assert.equal(num(runsCell), e.runs, `unresolved row ${i + 1} runs`);
  });
});

test("no hosted profile was granted a measured provenance or an intercept", () => {
  // The scope fence enforced from the other direction. The measurement was
  // taken on one laptop and describes one laptop, and a hosted call has no
  // measured fixed cost at all.
  for (const p of [
    ...factors.responseSurface.profiles,
    factors.responseSurface.unknownProfile,
  ]) {
    const who = p.matchPrefixes[0] ?? "(fallback)";
    assert.notEqual(p.confidence, "measured", `${who}: hosted profile on the measured rung`);
    assert.equal(p.aWhPerRequest, undefined, `${who}: hosted profile with a fixed cost`);
  }
});

test("the measured entries do not disturb the class-estimated tables", () => {
  // 2.2.0 is additive. Pinned here so a later edit has to be deliberate.
  const small = factors.computePaths.tokenProxy.entries.find((e) => e.scale === "small");
  assert.equal(small.whPerMillionTokens, 100);
  assert.equal(factors.gridIntensity.responseSurfacePinned.value, 429);
  assert.equal(factors.gridIntensity.tableGlobalAverage.value, 436);
  assert.equal(factors.constants.matureReferenceTreeCo2eGramsPerYear.value, 21000);
});

test("the published table declares the methodology it belongs to", () => {
  const docVersion = doc.match(/\*\*Version:\*\*\s*([\d.]+)/)[1];
  assert.equal(factors.methodologyVersion, docVersion);
  assert.equal(docVersion, "2.2.0");
});

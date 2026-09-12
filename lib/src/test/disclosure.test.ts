// Contract tests for the AiEDs 2.1.0 reference library (ENERGY-FIRST).
//
// The coefficients are a verbatim port of the shipped rand0m.ai app's energy
// model (same numbers, same formula), so the app and the standard agree to the
// number. These tests pin the energy-first derivation, the per-model
// coefficient selection, the provenance ladder, the confidence default, the
// cached-prefill pass-through, schema conformance, and the retained v1 read
// path.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  AIEDS_VERSION,
  AIEDS_IMPACT_MODEL_VERSION,
  FACTORS,
  MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR,
  METHODOLOGY_VERSION,
  MODEL_ENERGY_PROFILES,
  MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
  TABLE_GLOBAL_AVERAGE_GRAMS_PER_KWH,
  UNKNOWN_MODEL_PROFILE,
  SCHEMA_PROVENANCE_VALUES,
  disclosureFromResponse,
  disclosureFromV1CarbonRow,
  energyProfileForModel,
  provenanceForSchema,
  schemaRecordFromDisclosure,
  treeTimeLabel,
  treeTimeMinutesFor,
} from "../index.js";

const EPS = 1e-12;
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) <= EPS * Math.max(1, Math.abs(b)), `${a} !== ${b}`);

test("energy-first: gemini (vendor-published), carbon DERIVED from energy", () => {
  const d = disclosureFromResponse({
    provider: "GoogleAI",
    model: "gemini-2.0-flash",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  // energyWh = 1*0.12 + 1*0.48 = 0.60 (PUE 1.0), computed FIRST.
  close(d.energyWh, 0.6);
  // carbon is derived from energy, not an input: energyWh/1000 * 429.
  close(d.carbonGrams, 0.2574);
  assert.equal(
    d.carbonGrams,
    (d.energyWh / 1000) * MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
  );
  close(d.treeTimeMinutes, 6.442354285714286);
  assert.equal(d.treeTimeLabel, "6.4 min");
  close(d.phoneCharges, 0.05);
  close(d.ledBulbHours, 0.06);
  close(d.laptopMinutes, 0.72);
  close(d.drivingMeters, 1.5141176470588235);
  assert.equal(d.provenance, "vendor-published");
  assert.match(d.citation, /arxiv\.org\/abs\/2508\.15734/);
  assert.equal(d.aiedsVersion, AIEDS_VERSION);
  assert.equal(d.aiedsVersion, "AiEDs v2");
  assert.equal(d.aiedsImpactModelVersion, AIEDS_IMPACT_MODEL_VERSION);
});

test("output tokens cost more than input (0.48 > 0.12 for gemini)", () => {
  const outHeavy = disclosureFromResponse({
    provider: "GoogleAI",
    model: "gemini-2.0-flash",
    inputTokens: 0,
    outputTokens: 1000,
  });
  const inHeavy = disclosureFromResponse({
    provider: "GoogleAI",
    model: "gemini-2.0-flash",
    inputTokens: 1000,
    outputTokens: 0,
  });
  assert.ok(outHeavy.energyWh > inHeavy.energyWh);
  close(outHeavy.energyWh, 0.48);
  close(inHeavy.energyWh, 0.12);
});

test("per-model coefficients differ (gpt vendor-published, PUE 1.0)", () => {
  const d = disclosureFromResponse({
    provider: "OpenAI",
    model: "gpt-4o",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  close(d.energyWh, 0.85); // 0.17 + 0.68
  assert.equal(d.provenance, "vendor-published");
});

test("claude is class-estimated with PUE 1.2 applied", () => {
  const d = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-3-5-sonnet",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  close(d.energyWh, (0.145 + 0.58) * 1.2); // 0.87
  assert.equal(d.provenance, "class-estimated");
});

test("unlisted model falls back to UNKNOWN, labeled so (no silent provenance)", () => {
  const d = disclosureFromResponse({
    provider: "OtherAI",
    model: "some-model-v3",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  close(d.energyWh, (0.145 + 0.58) * 1.2); // frontier-class fallback
  assert.equal(d.provenance, "unknown");
  assert.match(d.citation, /UNKNOWN/);
  // grok is explicitly listed but also unknown.
  assert.equal(energyProfileForModel("grok-2").confidence, "unknown");
  // an empty/missing model id also resolves to unknown, never crashes.
  assert.equal(energyProfileForModel(undefined).confidence, "unknown");
});

test("every coefficient carries a non-empty citation (honesty contract)", () => {
  for (const model of ["gemini-x", "gpt-4o", "claude-3", "grok-2", "nope"]) {
    assert.ok(energyProfileForModel(model).citation.length > 0);
  }
});

test("MRT basis is 21 kg (v2 unified); tree-time formula", () => {
  assert.equal(MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR, 21000);
  assert.equal(treeTimeMinutesFor(0), 0);
  assert.equal(treeTimeMinutesFor(-1), 0);
  close(treeTimeMinutesFor(21000), 525600); // one MRT-year
  assert.equal(treeTimeLabel(0.5), "<1 min");
  assert.equal(treeTimeLabel(60), "1.0 hrs");
});

test("missing tokens zero out cleanly; disclosure copy attached", () => {
  const d = disclosureFromResponse({ provider: "GoogleAI", model: "gemini-x" });
  assert.equal(d.energyWh, 0);
  assert.equal(d.carbonGrams, 0);
  assert.equal(d.totalTokens, 0);
  assert.equal(d.notes.length, 4);
  assert.match(d.notes[1], /Energy is modeled first/);
});

test("v1 read path is retained (read-only) and re-reads old rows with 22 kg MRT", () => {
  const d = disclosureFromV1CarbonRow({ provider: "x", carbonGrams: 429 });
  close(d.energyWh, 1000); // 429 g at 429 g/kWh == 1 kWh (v1 inversion)
  close(d.treeTimeMinutes, (429 / 22000) * 525600); // v1 MRT basis, unchanged
  assert.equal(d.aiedsVersion, "AiEDs v1");
  assert.equal(d.aiedsImpactModelVersion, "v1");
  assert.match(d.citation, /SUPERSEDED/);
  const zero = disclosureFromV1CarbonRow({ provider: "x", carbonGrams: -3 });
  assert.equal(zero.energyWh, 0);
  assert.equal(zero.carbonGrams, 0);
});

test("the coefficients come from the published file, not a second copy", () => {
  // Pins the wiring, not a value. Before this, lib carried a hand-maintained
  // transcription of the Dart table and the only thing holding them together
  // was a comment saying "byte-for-byte port". A comment is not a gate.
  //
  // If someone re-inlines the table, these identity checks fail: the exported
  // profiles must BE the parsed file's array, not an equal-looking literal.
  assert.equal(MODEL_ENERGY_PROFILES, FACTORS.responseSurface.profiles);
  assert.equal(UNKNOWN_MODEL_PROFILE, FACTORS.responseSurface.unknownProfile);
  assert.equal(METHODOLOGY_VERSION, FACTORS.methodologyVersion);
  assert.equal(
    MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
    FACTORS.gridIntensity.responseSurfacePinned.value,
  );
  assert.equal(
    MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR,
    FACTORS.constants.matureReferenceTreeCo2eGramsPerYear.value,
  );
});

test("the two grid intensities are both readable and stay distinct", () => {
  // A consumer must be able to see BOTH and tell them apart, because they
  // apply to different derivation paths. Collapsing them silently would make
  // two tools disagree about the carbon behind the same energy.
  assert.notEqual(
    MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
    TABLE_GLOBAL_AVERAGE_GRAMS_PER_KWH,
  );
  assert.equal(FACTORS.gridIntensity.responseSurfacePinned.citation, null);
  assert.equal(
    FACTORS.gridIntensity.responseSurfacePinned.provenance,
    "project-modeled-constant",
  );
  assert.ok(
    (FACTORS.gridIntensity.tableGlobalAverage.citation ?? "").length > 0,
    "the compute-path global average must keep its citation",
  );
});

// -- 2.1.0: provenance, confidence, cached prefill, schema conformance --------

test("the factor tier is emitted as provenance, and confidence is not it", () => {
  // THE RENAME, and the assertion that fails first without it. Before lib
  // 2.1.0 this library put the factor tier in `confidence`, so a disclosure
  // said "vendor-published confidence": a value the schema's confidence enum
  // rejects and a reader cannot act on. `confidence` now means what
  // methodology section 5 says it means.
  const d = disclosureFromResponse({
    provider: "GoogleAI",
    model: "gemini-2.0-flash",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  assert.equal(d.provenance, "vendor-published");
  assert.equal(d.confidence, "low");
  for (const rung of [...SCHEMA_PROVENANCE_VALUES, "synthetic"]) {
    assert.notEqual(
      d.confidence,
      rung,
      `confidence carries the provenance rung "${rung}"; that is the pre-2.1.0 ` +
        `field this release renamed`,
    );
  }
});

test("confidence defaults to low and an explicit override wins", () => {
  const base = {
    provider: "GoogleAI",
    model: "gemini-2.0-flash",
    inputTokens: 100,
    outputTokens: 100,
  };
  // Section 5.1: any token-proxy method is low. This path is one.
  assert.equal(disclosureFromResponse(base).confidence, "low");
  assert.equal(
    disclosureFromResponse({ ...base, confidence: "high" }).confidence,
    "high",
  );
  // Fractional confidence is allowed by section 5 and by the schema.
  assert.equal(
    disclosureFromResponse({ ...base, confidence: 0.42 }).confidence,
    0.42,
  );
  // The v1 reader is a proxy of a proxy; it is never anything but low.
  assert.equal(
    disclosureFromV1CarbonRow({ provider: "x", carbonGrams: 429 }).confidence,
    "low",
  );
  assert.equal(
    disclosureFromV1CarbonRow({ provider: "x", carbonGrams: 429 }).provenance,
    "unknown",
  );
});

test("the cached-prefill breakdown passes through; the total is unchanged", () => {
  // Methodology 2.4.1: all three parts are input, charged at whPer1kIn. The
  // breakdown is published beside the total, never instead of it.
  const withTotal = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-3-5-sonnet",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  const withBreakdown = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-3-5-sonnet",
    inputTokenBreakdown: { plain: 200, cacheCreation: 300, cacheRead: 500 },
    outputTokens: 1000,
  });
  assert.equal(withBreakdown.inputTokens, 1000);
  assert.equal(withBreakdown.totalTokens, withTotal.totalTokens);
  assert.equal(withBreakdown.energyWh, withTotal.energyWh);
  assert.equal(withBreakdown.carbonGrams, withTotal.carbonGrams);
  assert.deepEqual(withBreakdown.inputTokenBreakdown, {
    plain: 200,
    cacheCreation: 300,
    cacheRead: 500,
  });
  // Absent unless the caller supplied one: no empty object to mislead a reader.
  assert.equal(withTotal.inputTokenBreakdown, undefined);
  // Giving both, in agreement, is fine.
  assert.equal(
    disclosureFromResponse({
      provider: "Anthropic",
      inputTokens: 1000,
      inputTokenBreakdown: { plain: 400, cacheRead: 600 },
    }).inputTokens,
    1000,
  );
  // Giving both in disagreement is a defect, not a preference to resolve.
  assert.throws(
    () =>
      disclosureFromResponse({
        provider: "Anthropic",
        inputTokens: 999,
        inputTokenBreakdown: { plain: 400, cacheRead: 600 },
      }),
    /breakdown must account for exactly the input total/,
  );
});

test("synthetic is in the ladder but never leaves this library", () => {
  // The published schema's provenance enum is closed and has no `synthetic`.
  // Methodology 2.1.0 names the rung; the schema catches up in the 2.2.0
  // proposal. Until then a generated input maps to `unknown`.
  assert.deepEqual(
    [...SCHEMA_PROVENANCE_VALUES],
    ["measured", "vendor-published", "class-estimated", "unknown"],
  );
  assert.equal(provenanceForSchema("synthetic"), "unknown");
  assert.equal(provenanceForSchema("measured"), "measured");
  // No profile in the published table claims it, so nothing can emit it.
  for (const p of [...MODEL_ENERGY_PROFILES, UNKNOWN_MODEL_PROFILE]) {
    assert.notEqual(p.confidence, "synthetic");
  }
});

test("a disclosure built by this library validates against the schema", () => {
  // The schema is NOT edited by this package and is read from spec/ as it
  // ships. If this passes, a consumer can archive what the library builds.
  const schemaUrl = new URL("../../../spec/aieds.schema.json", import.meta.url);
  const schema = JSON.parse(readFileSync(schemaUrl, "utf8"));
  const ajv = new Ajv2020({ strict: false });
  // ajv-formats v3 is CJS; NodeNext treats the default as module.exports, so
  // the cast is required. Same shape as mcp/src/index.ts.
  (addFormats as unknown as (a: Ajv2020) => void)(ajv);
  const validate = ajv.compile(schema);

  const d = disclosureFromResponse({
    provider: "GoogleAI",
    model: "gemini-2.0-flash",
    inputTokens: 412,
    outputTokens: 890,
    costUsd: 0.0031,
  });
  const record = schemaRecordFromDisclosure(d, {
    id: "aieds:example:inference:2026-09-12:001",
    subject: { kind: "model", name: "gemini-2.0-flash" },
    scope: "inference",
    window: "PT1S",
    source: "@random-knights/aieds-reference",
    generatedAt: "2026-09-12T00:00:00Z",
  });

  assert.ok(validate(record), JSON.stringify(validate.errors));
  assert.equal(record.provenance, "vendor-published");
  assert.equal(record.confidence, "low");
  assert.equal(record.compute?.tokens, d.totalTokens);
  // Energy is Wh in the disclosure and kWh in the record, and carbon is the
  // product of the two fields beside it. Checked, not assumed.
  close(record.energyKWh, d.energyWh / 1000);
  close(record.gCO2e, record.energyKWh * record.gridIntensity.gCO2ePerKWh);

  // The breakdown is deliberately not carried: `compute` is closed and has no
  // field for it (the 2.2.0 proposal adds one). Attaching it must fail, which
  // is why the mapper does not.
  assert.ok(
    !validate({
      ...record,
      compute: { tokens: d.totalTokens, cacheRead: 10 },
    }),
    "compute accepted an undeclared field; the schema is not closed",
  );
});

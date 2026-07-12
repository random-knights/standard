// Contract tests for the AIEDS 2.0.0 reference library (ENERGY-FIRST).
//
// The coefficients are a verbatim port of the shipped app model in
// `rk_ai/lib/src/impact/ai_impact.dart` (same numbers, same formula), so the
// app and the standard agree to the number. These tests pin the energy-first
// derivation, the per-model coefficient selection, the confidence tiers, and
// the retained v1 read path.
import assert from "node:assert/strict";
import test from "node:test";

import {
  AIEDS_VERSION,
  AIEDS_IMPACT_MODEL_VERSION,
  MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR,
  MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
  disclosureFromResponse,
  disclosureFromV1CarbonRow,
  energyProfileForModel,
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
  assert.equal(d.confidence, "vendor-published");
  assert.match(d.citation, /arxiv\.org\/abs\/2508\.15734/);
  assert.equal(d.aiedsVersion, AIEDS_VERSION);
  assert.equal(d.aiedsVersion, "AIEDS v2");
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
  assert.equal(d.confidence, "vendor-published");
});

test("claude is class-estimated with PUE 1.2 applied", () => {
  const d = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-3-5-sonnet",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  close(d.energyWh, (0.145 + 0.58) * 1.2); // 0.87
  assert.equal(d.confidence, "class-estimated");
});

test("unlisted model falls back to UNKNOWN, labeled so (no silent confidence)", () => {
  const d = disclosureFromResponse({
    provider: "OtherAI",
    model: "some-model-v3",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  close(d.energyWh, (0.145 + 0.58) * 1.2); // frontier-class fallback
  assert.equal(d.confidence, "unknown");
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
  assert.equal(d.aiedsVersion, "AIEDS v1");
  assert.equal(d.aiedsImpactModelVersion, "v1");
  assert.match(d.citation, /SUPERSEDED/);
  const zero = disclosureFromV1CarbonRow({ provider: "x", carbonGrams: -3 });
  assert.equal(zero.energyWh, 0);
  assert.equal(zero.carbonGrams, 0);
});

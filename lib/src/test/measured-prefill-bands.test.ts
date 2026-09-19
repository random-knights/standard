// Contract tests for the measured-device band lookup (methodology 2.3.1 /
// 2.3.2, Table 4 / Table 4b; RK-124).
//
// Two things this file exists to prove:
//   1. Band selection by prompt token count is exact at every boundary, read
//      off the published bands, not a second hardcoded copy of 256/2048.
//   2. THE SCOPE FENCE holds from the library's side: a measured coefficient
//      is reachable only by its own published device id, and nothing in the
//      hosted response-surface path (disclosureFromResponse,
//      energyProfileForModel) can reach a measured figure by any model id, a
//      hosted one included.
import assert from "node:assert/strict";
import test from "node:test";

import {
  FACTORS,
  MEASURED_DEVICES,
  disclosureFromResponse,
  energyProfileForModel,
  measuredDeviceById,
  measuredPrefillBandFor,
} from "../index.js";

// The one device this table publishes as of methodology 2.3.0. Read from the
// table itself so this file does not restate an id string that could drift.
const DEVICE_IDS = MEASURED_DEVICES.map((e) => e.id);

test("the published table carries at least one measured device with a published-by-band prefill phase", () => {
  assert.ok(DEVICE_IDS.length > 0, "no measured devices published");
  const withBands = MEASURED_DEVICES.filter(
    (e) => e.phases.prefill.status === "published-by-band",
  );
  assert.ok(withBands.length > 0, "no device has a published-by-band prefill phase");
});

for (const deviceId of DEVICE_IDS) {
  test(`${deviceId}: band selection is exact at every boundary, lower end inclusive`, () => {
    const entry = measuredDeviceById(deviceId);
    assert.ok(entry, "measuredDeviceById did not find its own id");
    const phase = entry!.phases.prefill;
    if (phase.status !== "published-by-band" || !phase.bands) {
      // Not every future device need be band-published; nothing to check here.
      return;
    }
    // Read the boundaries off the table itself, never hardcoded, so this
    // test still means something if Table 4b's bounds ever move.
    const bounds = phase.bands.map((b) => b.upperBoundTokens).filter((b): b is number => b !== null);
    for (const boundary of bounds) {
      const below = measuredPrefillBandFor(deviceId, boundary - 1);
      const at = measuredPrefillBandFor(deviceId, boundary);
      assert.ok(below, `${deviceId}: no band below boundary ${boundary}`);
      assert.ok(at, `${deviceId}: no band at boundary ${boundary}`);
      assert.notEqual(
        below!.band,
        at!.band,
        `${deviceId}: boundary ${boundary} did not change band`,
      );
      // Inclusive on the LOWER end: the boundary token count belongs to the
      // band whose lowerBoundTokens equals it, not the one below.
      assert.equal(at!.lowerBoundTokens, boundary, `${deviceId}: boundary ${boundary} band`);
    }
    // The last band is unbounded above.
    const last = phase.bands[phase.bands.length - 1];
    assert.equal(last.upperBoundTokens, null, `${deviceId}: last band must be unbounded`);
    const farAbove = measuredPrefillBandFor(deviceId, 10_000_000);
    assert.equal(farAbove?.band, last.band, `${deviceId}: a very long prompt must fall in the last band`);
  });

  test(`${deviceId}: every published band's own token range round-trips through selection`, () => {
    const entry = measuredDeviceById(deviceId)!;
    const phase = entry.phases.prefill;
    if (phase.status !== "published-by-band" || !phase.bands) return;
    for (const b of phase.bands) {
      if (b.runs === 0) continue;
      // The lowest and highest prompt token counts this band was actually
      // measured at must select this same band, not a neighbor.
      assert.equal(
        measuredPrefillBandFor(deviceId, b.promptTokensObservedMin!)?.band,
        b.band,
        `${deviceId} ${b.band}: observed min selects a different band`,
      );
      assert.equal(
        measuredPrefillBandFor(deviceId, b.promptTokensObservedMax!)?.band,
        b.band,
        `${deviceId} ${b.band}: observed max selects a different band`,
      );
    }
  });
}

test("an unpublished device id returns null, never a guess", () => {
  assert.equal(measuredPrefillBandFor("not-a-published-device", 1000), null);
  assert.equal(measuredPrefillBandFor("", 1000), null);
  assert.equal(measuredPrefillBandFor(undefined, 1000), null);
  assert.equal(measuredDeviceById("not-a-published-device"), undefined);
});

test("an out-of-range prompt token count returns null, never a guess", () => {
  const deviceId = DEVICE_IDS[0];
  assert.equal(measuredPrefillBandFor(deviceId, -1), null);
  assert.equal(measuredPrefillBandFor(deviceId, NaN), null);
  assert.equal(measuredPrefillBandFor(deviceId, Infinity), null);
});

test("THE SCOPE FENCE: no hosted provider model id ever resolves to a measured device", () => {
  // A hosted model id is never a Table 4 / 4b device id (they name hardware,
  // runtime, model AND quantization, e.g. "...-llama3-2-1b-q8-0"), so lookup
  // must refuse it. This is the enforcement, not a restatement of the rule.
  for (const hostedModel of ["gemini-2.0-flash", "gpt-4o", "claude-3-opus", "grok-2", "llama3.2:1b"]) {
    assert.equal(
      measuredPrefillBandFor(hostedModel, 1000),
      null,
      `${hostedModel}: a hosted-shaped model id must not resolve to a measured band`,
    );
  }
});

test("THE SCOPE FENCE: the hosted disclosure path never carries a measured provenance or a band", () => {
  for (const model of ["gemini-2.0-flash", "gpt-4o", "claude-3-opus", "grok-2", "some-unlisted-model"]) {
    const profile = energyProfileForModel(model);
    assert.notEqual(profile.confidence, "measured", `${model}: hosted profile on the measured rung`);
    assert.equal(
      (profile as unknown as { bands?: unknown }).bands,
      undefined,
      `${model}: hosted profile carries a band, which only a measured entry may`,
    );
    const d = disclosureFromResponse({
      provider: "test",
      model,
      inputTokens: 1000,
      outputTokens: 1000,
    });
    assert.notEqual(d.provenance, "measured", `${model}: disclosure landed on the measured rung`);
  }
});

test("the measured devices block, if present, is never empty of what the JSON promises", () => {
  // Defensive: MEASURED_DEVICES silently degrades to [] if the table ever
  // drops measuredDevices. This pins that FACTORS itself still carries the
  // block this file's other tests assume.
  assert.ok(FACTORS.measuredDevices, "aieds-factors.json has no measuredDevices block");
  assert.ok(FACTORS.measuredDevices!.entries.length > 0);
});

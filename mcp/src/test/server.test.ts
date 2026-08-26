import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { estimate } from "../estimate.js";
import {
  DEFAULT_POWER_W,
  FACTORS,
  GRID_FACTORS,
  IMPACT_MODEL_VERSION,
  JOULES_PER_TFLOP,
  METHODOLOGY_VERSION,
  MODEL_ENERGY_PROFILES,
  RESPONSE_SURFACE_GRID_GRAMS_PER_KWH,
  TOKENS_WH_PER_MILLION,
  UNKNOWN_MODEL_PROFILE,
  energyProfileForModel,
} from "../factors.js";

// Load the canonical schema - same path the server uses at runtime.
const schemaPath = new URL("../../../spec/aieds.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv2020({ strict: false });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
const validate = ajv.compile(schema);

// ---------------------------------------------------------------------------
// aieds_estimate
// ---------------------------------------------------------------------------
describe("aieds_estimate", () => {
  it("gpuSeconds + known hardware -> deterministic med-confidence result", () => {
    const r = estimate({
      subject: { kind: "model", name: "test-model" },
      compute: { gpuSeconds: 3600, hardware: "NVIDIA H100 SXM" },
    });
    // 3600 s x 700 W / 3_600_000 = 0.7 kWh
    assert.strictEqual(r.energyKWh, 0.7);
    // 0.7 x 436 gCO2e/kWh = 305.2
    assert.strictEqual(r.gCO2e, 305.2);
    assert.strictEqual(r.confidence, "med");
    assert.strictEqual(r.methodologyVersion, METHODOLOGY_VERSION);
    assert.strictEqual(r.gridIntensity.region, "global_average");
    assert.strictEqual(r.gridIntensity.gCO2ePerKWh, GRID_FACTORS["global_average"].gCO2ePerKWh);
  });

  it("gpuSeconds without hardware falls back to default power -> low confidence", () => {
    const r = estimate({
      subject: { kind: "agent", name: "test-agent" },
      compute: { gpuSeconds: 3600 },
    });
    // default 400 W: 3600 x 400 / 3_600_000 = 0.4 kWh
    assert.strictEqual(r.energyKWh, 0.4);
    assert.strictEqual(r.confidence, "low");
  });

  it("tokens only -> low confidence, medium scale", () => {
    const r = estimate({
      subject: { kind: "agent", name: "test-agent" },
      compute: { tokens: 1_000_000, modelScale: "medium" },
    });
    // 1M tokens x 500 Wh/1M / 1000 = 0.5 kWh
    assert.strictEqual(r.energyKWh, 0.5);
    // 0.5 x 436 = 218
    assert.strictEqual(r.gCO2e, 218);
    assert.strictEqual(r.confidence, "low");
    assert.ok(r.notes.some((n) => n.includes("Token proxy")));
  });

  it("flops path -> low confidence", () => {
    const r = estimate({
      subject: { kind: "model", name: "test-model" },
      // 1 PFLOP: (1e15/1e12) * 0.35 J = 350 J = 9.72e-5 kWh
      compute: { flops: 1e15 },
    });
    assert.ok(r.energyKWh > 0);
    assert.strictEqual(r.confidence, "low");
    assert.ok(r.notes.some((n) => n.includes("FLOPs")));
  });

  it("custom grid region", () => {
    const r = estimate({
      subject: { kind: "model", name: "test-model" },
      compute: { gpuSeconds: 3600, hardware: "NVIDIA H100 SXM" },
      gridRegion: "France",
    });
    assert.strictEqual(r.gridIntensity.region, "France");
    assert.strictEqual(r.gridIntensity.gCO2ePerKWh, GRID_FACTORS["France"].gCO2ePerKWh);
    // 0.7 x 85 = 59.5
    assert.strictEqual(r.gCO2e, 59.5);
  });

  it("unknown grid region falls back to global_average", () => {
    const r = estimate({
      subject: { kind: "model", name: "test-model" },
      compute: { gpuSeconds: 3600, hardware: "NVIDIA H100 SXM" },
      gridRegion: "Atlantis",
    });
    assert.strictEqual(r.gridIntensity.region, "global_average");
    assert.ok(r.notes.some((n) => n.includes("Atlantis")));
  });

  it("throws when no compute metric provided", () => {
    assert.throws(() =>
      estimate({
        subject: { kind: "model", name: "test" },
        compute: {},
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// aieds_disclose (schema validation gate)
// ---------------------------------------------------------------------------
describe("aieds_disclose (schema)", () => {
  const validBase = {
    id: "aieds:test:inference:2026-06-29:001",
    subject: { kind: "model", name: "test-model", version: "1.0" },
    scope: "inference",
    window: "PT1H",
    compute: { gpuSeconds: 3600, hardware: "NVIDIA H100 SXM" },
    energyKWh: 0.7,
    gCO2e: 305.2,
    gridIntensity: { gCO2ePerKWh: 436, region: "global_average" },
    confidence: "med",
    methodologyVersion: "1.0.0",
    source: "aieds-mcp v1.0.0",
    generatedAt: "2026-06-29T12:00:00Z",
  };

  it("accepts a fully valid disclosure", () => {
    const ok = validate(validBase);
    assert.ok(ok, `Validation errors: ${JSON.stringify(validate.errors)}`);
  });

  it("accepts numeric confidence (0 to 1)", () => {
    const ok = validate({ ...validBase, confidence: 0.75 });
    assert.ok(ok);
  });

  it("accepts a disclosure without optional compute field", () => {
    const { compute: _, ...noCompute } = validBase;
    const ok = validate(noCompute);
    assert.ok(ok);
  });

  it("rejects a disclosure missing required fields", () => {
    const ok = validate({ id: "x", subject: { kind: "model", name: "test" } });
    assert.ok(!ok);
    assert.ok(validate.errors && validate.errors.length > 0);
  });

  it("rejects invalid confidence string", () => {
    const ok = validate({ ...validBase, confidence: "very-high" });
    assert.ok(!ok);
  });

  it("rejects confidence out of numeric range", () => {
    const ok = validate({ ...validBase, confidence: 1.5 });
    assert.ok(!ok);
  });

  it("rejects invalid scope value", () => {
    const ok = validate({ ...validBase, scope: "cloud" });
    assert.ok(!ok);
  });

  it("rejects invalid subject kind", () => {
    const ok = validate({ ...validBase, subject: { kind: "dataset", name: "x" } });
    assert.ok(!ok);
  });

  it("rejects malformed generatedAt (not date-time)", () => {
    const ok = validate({ ...validBase, generatedAt: "not-a-date" });
    assert.ok(!ok);
  });

  it("rejects negative energyKWh", () => {
    const ok = validate({ ...validBase, energyKWh: -1 });
    assert.ok(!ok);
  });

  it("validates all three bundled examples", () => {
    for (const name of [
      "disclosure-model-inference.json",
      "disclosure-agent-session.json",
      "disclosure-app-monthly.json",
    ]) {
      const path = new URL(`../../../spec/examples/${name}`, import.meta.url);
      const data = JSON.parse(readFileSync(path, "utf-8"));
      const ok = validate(data);
      assert.ok(ok, `${name}: ${JSON.stringify(validate.errors)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Factor-table wiring
// ---------------------------------------------------------------------------
describe("factor tables come from the published file", () => {
  it("stamps the version the table declares, not a hardcoded one", () => {
    // This used to be a literal "2.0.0" sitting above tables that implement
    // 1.0.0, so the server stamped records with a version its own numbers did
    // not support. The stamp is now read from the table it labels.
    assert.strictEqual(FACTORS.methodologyVersion, METHODOLOGY_VERSION);
    assert.strictEqual(METHODOLOGY_VERSION, "2.0.0");
    assert.strictEqual(IMPACT_MODEL_VERSION, "v2");
  });

  it("exposes Tables 1 to 3 by reference, not as a second transcription", () => {
    // Identity, not equality: a re-inlined literal would pass an equality
    // check and fail this one.
    assert.strictEqual(
      DEFAULT_POWER_W,
      FACTORS.computePaths.hardwareTdp.defaultPowerW,
    );
    assert.strictEqual(
      JOULES_PER_TFLOP,
      FACTORS.computePaths.flop.joulesPerTflop,
    );
    assert.strictEqual(FACTORS.computePaths.hardwareTdp.entries.length, 11);
    assert.strictEqual(FACTORS.computePaths.gridByRegion.entries.length, 14);
    assert.strictEqual(FACTORS.computePaths.tokenProxy.entries.length, 3);
  });

  it("keeps the token-proxy default an alias, not a fourth value", () => {
    // v1 carried `default: 500` with no counterpart row in Table 2. Anyone
    // reading the table could not tell whether 500 was a documented figure or
    // a coincidence. It now resolves through defaultScale.
    const defaultScale = FACTORS.computePaths.tokenProxy.defaultScale;
    const row = FACTORS.computePaths.tokenProxy.entries.find(
      (e) => e.scale === defaultScale,
    );
    assert.ok(row, "defaultScale must name a real row");
    assert.strictEqual(TOKENS_WH_PER_MILLION["default"], row.whPerMillionTokens);
    assert.strictEqual(TOKENS_WH_PER_MILLION[defaultScale], row.whPerMillionTokens);
  });

  it("keeps the two grid intensities distinct and separately scoped", () => {
    // 436 serves the compute paths (section 3, Table 3). 429 serves the
    // response-surface path (section 2.4). A consumer calling two tools gets
    // two different carbon figures for the same energy, which is a real
    // finding filed for owner ratification, not something to paper over here.
    assert.strictEqual(GRID_FACTORS["global_average"].gCO2ePerKWh, 436);
    assert.strictEqual(RESPONSE_SURFACE_GRID_GRAMS_PER_KWH, 429);
    assert.notStrictEqual(
      GRID_FACTORS["global_average"].gCO2ePerKWh,
      RESPONSE_SURFACE_GRID_GRAMS_PER_KWH,
    );
    assert.strictEqual(
      FACTORS.gridIntensity.responseSurfacePinned.citation,
      null,
      "429 must stay labeled as a project modeled constant with no citation",
    );
    assert.ok(
      (FACTORS.gridIntensity.tableGlobalAverage.citation ?? "").length > 0,
    );
  });

  it("carries a citation on every response-surface coefficient", () => {
    const all = [...MODEL_ENERGY_PROFILES, UNKNOWN_MODEL_PROFILE];
    assert.strictEqual(all.length, 5);
    for (const p of all) {
      assert.ok(
        p.citation.trim().length > 0,
        `${p.matchPrefixes[0] ?? "fallback"} has no citation`,
      );
      assert.ok(p.whPer1kOut > p.whPer1kIn);
    }
    assert.strictEqual(UNKNOWN_MODEL_PROFILE.confidence, "unknown");
    assert.strictEqual(energyProfileForModel("gpt-4o").confidence, "vendor-published");
    assert.strictEqual(energyProfileForModel("o3-mini").confidence, "vendor-published");
    assert.strictEqual(energyProfileForModel("nobody-elses").confidence, "unknown");
  });
});

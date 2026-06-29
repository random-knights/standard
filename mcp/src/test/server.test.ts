import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { estimate } from "../estimate.js";
import { METHODOLOGY_VERSION, GRID_FACTORS } from "../factors.js";

// Load the canonical schema — same path the server uses at runtime.
const schemaPath = new URL("../../../spec/aieds.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv2020({ strict: false });
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
const validate = ajv.compile(schema);

// ---------------------------------------------------------------------------
// aieds_estimate
// ---------------------------------------------------------------------------
describe("aieds_estimate", () => {
  it("gpuSeconds + known hardware → deterministic med-confidence result", () => {
    const r = estimate({
      subject: { kind: "model", name: "test-model" },
      compute: { gpuSeconds: 3600, hardware: "NVIDIA H100 SXM" },
    });
    // 3600 s × 700 W / 3_600_000 = 0.7 kWh
    assert.strictEqual(r.energyKWh, 0.7);
    // 0.7 × 436 gCO2e/kWh = 305.2
    assert.strictEqual(r.gCO2e, 305.2);
    assert.strictEqual(r.confidence, "med");
    assert.strictEqual(r.methodologyVersion, METHODOLOGY_VERSION);
    assert.strictEqual(r.gridIntensity.region, "global_average");
    assert.strictEqual(r.gridIntensity.gCO2ePerKWh, GRID_FACTORS["global_average"].gCO2ePerKWh);
  });

  it("gpuSeconds without hardware falls back to default power → low confidence", () => {
    const r = estimate({
      subject: { kind: "agent", name: "test-agent" },
      compute: { gpuSeconds: 3600 },
    });
    // default 400 W: 3600 × 400 / 3_600_000 = 0.4 kWh
    assert.strictEqual(r.energyKWh, 0.4);
    assert.strictEqual(r.confidence, "low");
  });

  it("tokens only → low confidence, medium scale", () => {
    const r = estimate({
      subject: { kind: "agent", name: "test-agent" },
      compute: { tokens: 1_000_000, modelScale: "medium" },
    });
    // 1M tokens × 500 Wh/1M / 1000 = 0.5 kWh
    assert.strictEqual(r.energyKWh, 0.5);
    // 0.5 × 436 = 218
    assert.strictEqual(r.gCO2e, 218);
    assert.strictEqual(r.confidence, "low");
    assert.ok(r.notes.some((n) => n.includes("Token proxy")));
  });

  it("flops path → low confidence", () => {
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
    // 0.7 × 85 = 59.5
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

  it("accepts numeric confidence (0–1)", () => {
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

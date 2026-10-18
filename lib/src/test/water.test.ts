// Tests for the AiEDs 2.5.0 modeled water estimate (methodology 2.6).
//
// The vectors V1 to V7 are the arithmetic of the methodology, recomputed here
// from the coefficients in Table 5 (site 0.36, grid 4.52, low 0.27 + 1.5, high
// 1.8 + 9.5 L/kWh). They are not measurements.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  GRID_WATER_L_PER_KWH,
  SITE_WUE_L_PER_KWH,
  WATER_BANNED_WORDS,
  WATER_MODELED_ESTIMATE_COPY,
  disclosureFromResponse,
  schemaRecordFromDisclosure,
  teaspoonPhrase,
  waterBlockFromEnergyKWh,
  waterFromEnergyWh,
  waterLine,
} from "../index.js";

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} !== ${b}`);

test("Table 5 is read from the published table", () => {
  assert.equal(SITE_WUE_L_PER_KWH.value, 0.36);
  assert.equal(SITE_WUE_L_PER_KWH.low, 0.27);
  assert.equal(SITE_WUE_L_PER_KWH.high, 1.8);
  assert.equal(GRID_WATER_L_PER_KWH.value, 4.52);
  assert.equal(GRID_WATER_L_PER_KWH.low, 1.5);
  assert.equal(GRID_WATER_L_PER_KWH.high, 9.5);
  assert.equal(WATER_MODELED_ESTIMATE_COPY, "Water is a modeled estimate.");
});

test("V1: 0.24 Wh (0.00024 kWh), defaults", () => {
  const b = waterBlockFromEnergyKWh(0.00024)!;
  close(b.siteL!, 0.0000864); // 0.00024 x 0.36
  close(b.gridL!, 0.0010848); // 0.00024 x 4.52
  close(b.waterL!, 0.0011712); // 1.1712 mL
  close(b.comparison!.value, 0.23424); // 1.1712 / 5
  const e = waterFromEnergyWh(0.24)!;
  close(e.waterMl.default, 1.1712);
  close(e.teaspoons.default, 0.23424);
});

test("V2: 1 kWh, defaults, shown in liters", () => {
  const b = waterBlockFromEnergyKWh(1)!;
  close(b.siteL!, 0.36);
  close(b.gridL!, 4.52);
  close(b.waterL!, 4.88);
  const e = waterFromEnergyWh(1000)!;
  close(e.teaspoons.default, 976); // 4880 mL / 5, over the 250 teaspoon line
  const line = waterLine(e);
  assert.match(line, /^Water: about 4\.9 L \(1\.8 to 11\.3 L\)\. Modeled estimate\.$/);
  assert.ok(!/teaspoon/.test(line), "above 250 teaspoons the view shows liters");
});

test("V3: no energy, no water block and no estimate", () => {
  assert.equal(waterBlockFromEnergyKWh(undefined), null);
  assert.equal(waterBlockFromEnergyKWh(Number.NaN), null);
  assert.equal(waterBlockFromEnergyKWh(-1), null);
  assert.equal(waterFromEnergyWh(Number.NaN), null);
  assert.equal(waterFromEnergyWh(-0.1), null);
  assert.equal(waterFromEnergyWh(Number.POSITIVE_INFINITY), null);
});

test("V5: 0.24 Wh range is 0.4248 to 2.712 mL and brackets the total", () => {
  const e = waterFromEnergyWh(0.24)!;
  close(e.waterMl.low, 0.4248); // 0.00024 x 1.77 x 1000
  close(e.waterMl.high, 2.712); // 0.00024 x 11.3 x 1000
  assert.ok(e.waterMl.low <= e.waterMl.default && e.waterMl.default <= e.waterMl.high);
  const b = waterBlockFromEnergyKWh(0.00024)!;
  close(b.rangeL!.low, 0.0004248);
  close(b.rangeL!.high, 0.002712);
});

test("V6: 1 kWh range is 1.77 to 11.3 L", () => {
  const e = waterFromEnergyWh(1000)!;
  close(e.waterMl.low / 1000, 1.77);
  close(e.waterMl.high / 1000, 11.3);
});

test("V7: a region with no figure uses the US average and says so", () => {
  const none = waterFromEnergyWh(0.24)!;
  assert.equal(none.basis, "US average");
  assert.equal(none.requestedRegion, undefined);
  assert.equal(none.confidence, "low");
  const eu = waterFromEnergyWh(0.24, "France")!;
  assert.equal(eu.basis, "US average", "no regional figure exists, so it is never labeled regional");
  assert.equal(eu.requestedRegion, "France");
  close(eu.waterMl.default, 1.1712); // grid term is still 4.52
  assert.match(waterLine(eu), /Grid water uses a US average\.$/);
  const us = waterFromEnergyWh(0.24, "US average")!;
  assert.equal(us.basis, "US average");
  assert.equal(us.requestedRegion, undefined);
});

test("return shape: {waterMl, teaspoons, basis, confidence}", () => {
  const e = waterFromEnergyWh(0.24)!;
  assert.deepEqual(Object.keys(e).sort(), ["basis", "confidence", "teaspoons", "waterMl"]);
  assert.deepEqual(Object.keys(e.waterMl).sort(), ["default", "high", "low"]);
  assert.deepEqual(Object.keys(e.teaspoons).sort(), ["default", "high", "low"]);
});

test("the receipt line: plain words, range, modeled estimate", () => {
  assert.equal(
    waterLine(waterFromEnergyWh(0.24)!),
    "Water: about 1.2 mL (0.4 to 2.7 mL), about a quarter of a teaspoon. Modeled estimate.",
  );
  assert.equal(teaspoonPhrase(0.234), "about a quarter of a teaspoon");
  assert.equal(teaspoonPhrase(0.5), "about half a teaspoon");
  assert.equal(teaspoonPhrase(1), "about a teaspoon");
  assert.equal(teaspoonPhrase(3.04), "about 3.0 teaspoons");
  assert.equal(teaspoonPhrase(40.4), "about 40 teaspoons");
});

test("no banned word and no scarcity or credit claim in any line", () => {
  assert.deepEqual([...WATER_BANNED_WORDS], [
    "offset", "credit", "neutral", "positive", "saved", "restored", "replenished",
  ]);
  for (const wh of [0.001, 0.24, 3, 40, 900, 5000, 1e6]) {
    for (const region of [undefined, "France"]) {
      const line = waterLine(waterFromEnergyWh(wh, region)!).toLowerCase();
      for (const w of WATER_BANNED_WORDS) {
        assert.ok(!line.includes(w), `"${w}" in: ${line}`);
      }
      assert.ok(!/scarc|drought|impact|your area/.test(line), line);
      assert.ok(/\(.+ to .+\)/.test(line), `range missing: ${line}`);
      assert.ok(line.includes("Modeled estimate.".toLowerCase()), line);
    }
  }
});

test("tiny energies never print a zero", () => {
  const line = waterLine(waterFromEnergyWh(0.00001)!);
  assert.ok(!/ 0\.0 /.test(line) && !/about 0 /.test(line), line);
});

test("existing disclosure numbers are untouched by water", () => {
  const d = disclosureFromResponse({
    provider: "GoogleAI", model: "gemini-2.0-flash", inputTokens: 412, outputTokens: 900,
  });
  assert.ok(!("water" in d), "the response disclosure gains no water field");
  const rec = schemaRecordFromDisclosure(d, {
    id: "x", subject: { kind: "model", name: "n" }, scope: "inference", window: "PT1S", source: "t",
  });
  assert.ok(!("water" in rec), "the record has no water unless asked");
});

test("a record with the water block validates against the schema", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../../../spec/aieds.schema.json", import.meta.url), "utf8"),
  );
  const ajv = new Ajv2020({ strict: false });
  (addFormats as unknown as (a: Ajv2020) => void)(ajv);
  const validate = ajv.compile(schema);
  const d = disclosureFromResponse({
    provider: "GoogleAI", model: "gemini-2.0-flash", inputTokens: 412, outputTokens: 900,
  });
  const rec = schemaRecordFromDisclosure(d, {
    id: "aieds:test:water:001", subject: { kind: "model", name: "gemini-2.0-flash" },
    scope: "inference", window: "PT1S", source: "aieds-reference test", includeWater: true,
  });
  assert.ok(rec.water, "water block present when asked");
  assert.equal(rec.water!.gridBasis, "default");
  assert.equal(rec.water!.confidence, "low");
  close(rec.water!.waterL!, rec.water!.siteL! + rec.water!.gridL!);
  assert.ok(validate(rec), JSON.stringify(validate.errors));
});

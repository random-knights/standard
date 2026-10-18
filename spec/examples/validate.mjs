#!/usr/bin/env node
// AiEDs spec example conformance script - CC BY 4.0 rand0m.ai
// Run from the spec/ directory: node examples/validate.mjs
//
// Two sets, and BOTH matter.
//
// The v2 disclosures must validate. The v1 disclosures must NOT: methodology
// 1.x is superseded and must not be used for new disclosures, so a v2 schema
// that accepts a v1 record is certifying nonconformance. Before this change
// every fixture stamped 1.0.0 and every one of them passed, which meant the
// suite was proving the server accepts v1 records.

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);

const schemaPath = resolve(__dirname, "../aieds.schema.json");
const schemaBytes = readFileSync(schemaPath);
const schema = JSON.parse(schemaBytes.toString("utf-8"));
const validate = ajv.compile(schema);

// Printed so a citation can pair the methodology version with the exact bytes,
// the same way the prose standard is cited.
const sha256 = createHash("sha256").update(schemaBytes).digest("hex");

const conforming = [
  "disclosure-model-inference.json",
  "disclosure-agent-session.json",
  "disclosure-app-monthly.json",
  "disclosure-model-inference-no-provenance.json",
  "disclosure-model-inference-water.json",
];

// Deprecated-reader fixtures. Kept so a reader can see what a v1 record looked
// like, and asserted to FAIL so nothing can quietly start accepting them again.
const rejected = [
  "deprecated-v1-model-inference.json",
  "deprecated-v1-agent-session.json",
  "deprecated-v1-app-monthly.json",
];

const read = (name) => JSON.parse(readFileSync(resolve(__dirname, name), "utf-8"));

let pass = 0;
let fail = 0;

console.log(`schema  ${schema.$id}`);
console.log(`sha256  ${sha256}\n`);

console.log("must validate:");
for (const name of conforming) {
  const data = read(name);
  if (!/^2\./.test(data.methodologyVersion)) {
    console.error(`  FAIL  ${name} is in the conforming set but stamps ${data.methodologyVersion}`);
    fail++;
    continue;
  }
  if (validate(data)) {
    console.log(`  ok    ${name}  (methodologyVersion ${data.methodologyVersion})`);
    pass++;
  } else {
    console.error(`  FAIL  ${name}`);
    for (const err of validate.errors ?? []) {
      console.error(`        ${err.instancePath || "(root)"} - ${err.message}`);
    }
    fail++;
  }
}

console.log("\nmust be rejected, deprecated readers:");
for (const name of rejected) {
  const data = read(name);
  if (!/^1\./.test(data.methodologyVersion)) {
    console.error(`  FAIL  ${name} is in the rejected set but stamps ${data.methodologyVersion}`);
    fail++;
    continue;
  }
  if (validate(data)) {
    console.error(`  FAIL  ${name} VALIDATED against the v2 schema. A superseded record must not conform.`);
    fail++;
  } else {
    const why = (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; ");
    console.log(`  ok    ${name} rejected  (${why})`);
    pass++;
  }
}

// -- Water (methodology 2.6, rules W1 to W5, W8, W9) -------------------------
//
// The schema checks shape. These checks are the arithmetic and the "never a
// placeholder" rules a schema cannot say. They run on the conforming water
// example, then on mutated copies that MUST each be rejected, so the rules are
// proven to bite and not only to pass.
const factors = JSON.parse(readFileSync(resolve(__dirname, "../v2/aieds-factors.json"), "utf-8"));
const TOL = 1e-9;

/** Returns a list of broken-rule messages; empty means the block conforms. */
function waterProblems(record) {
  const w = record.water;
  if (w === undefined) return [];
  const bad = [];
  if (typeof record.energyKWh !== "number") bad.push("W1 water requires energyKWh");
  if (w.basis !== "consumption") bad.push("W5 basis must be consumption");
  if (w.gridBasis === "default" && "gridRegion" in w) bad.push("W8 default grid basis forbids gridRegion");
  if (w.waterL === null) {
    if (w.siteL !== null && w.gridL !== null) bad.push("W9 waterL is null but both terms are present");
    return bad;
  }
  if (!(w.waterL > 0) && record.energyKWh > 0) bad.push("W9 zero or negative waterL with energy present");
  if (Math.abs(w.siteL + w.gridL - w.waterL) > TOL) bad.push("W2 waterL must equal siteL + gridL");
  if (w.rangeL === null || w.rangeL === undefined) {
    bad.push("W4 rangeL is required when waterL is present");
  } else if (!(w.rangeL.low <= w.waterL && w.waterL <= w.rangeL.high)) {
    bad.push("W4 rangeL must bracket waterL");
  }
  if (Math.abs(w.siteL - record.energyKWh * w.siteWueLPerKWh) > TOL) bad.push("W2 siteL must be energyKWh x siteWue");
  if (Math.abs(w.gridL - record.energyKWh * w.gridWaterLPerKWh) > TOL) bad.push("W2 gridL must be energyKWh x gridWater");
  if (w.gridBasis === "default" && w.rangeL) {
    if (w.siteWueLPerKWh !== factors.water.siteWue.value) bad.push("default site coefficient must be the Table 5 default");
    if (w.gridWaterLPerKWh !== factors.water.gridWaterIntensity.value) bad.push("default grid coefficient must be the Table 5 default");
    const lo = record.energyKWh * (factors.water.siteWue.low + factors.water.gridWaterIntensity.low);
    const hi = record.energyKWh * (factors.water.siteWue.high + factors.water.gridWaterIntensity.high);
    if (Math.abs(w.rangeL.low - lo) > TOL || Math.abs(w.rangeL.high - hi) > TOL) bad.push("rangeL must be the Table 5 low and high");
  }
  return bad;
}

console.log("\nwater rules (W1 to W5, W8, W9):");
const waterExample = read("disclosure-model-inference-water.json");
{
  const problems = waterProblems(waterExample);
  if (problems.length === 0) {
    console.log("  ok    disclosure-model-inference-water.json satisfies the water rules");
    pass++;
  } else {
    console.error(`  FAIL  water example: ${problems.join("; ")}`);
    fail++;
  }
}
const mutations = {
  "withdrawal basis": (r) => { r.water.basis = "withdrawal"; },
  "total is not siteL + gridL": (r) => { r.water.waterL = 0.5; },
  "range missing": (r) => { r.water.rangeL = null; },
  "range does not bracket the total": (r) => { r.water.rangeL = { low: 0.01, high: 0.02 }; },
  "default basis claims a region": (r) => { r.water.gridRegion = "France"; },
  "region basis without a region": (r) => { r.water.gridBasis = "region"; },
  "confidence high": (r) => { r.water.confidence = "high"; },
  "zero as a placeholder": (r) => { r.water.waterL = 0; r.water.siteL = 0; r.water.gridL = 0; },
  "comparison unit swapped": (r) => { r.water.comparison.unit = "cup"; },
  "extra field": (r) => { r.water.extraL = 1; },
  "wrong site coefficient": (r) => { r.water.siteWueLPerKWh = 1; r.water.siteL = r.energyKWh; r.water.waterL = r.water.siteL + r.water.gridL; },
};
for (const [name, mutate] of Object.entries(mutations)) {
  const r = structuredClone(waterExample);
  mutate(r);
  const schemaOk = validate(r);
  const rulesOk = waterProblems(r).length === 0;
  if (schemaOk && rulesOk) {
    console.error(`  FAIL  mutation accepted: ${name}`);
    fail++;
  } else {
    console.log(`  ok    rejected: ${name}`);
    pass++;
  }
}
{
  // V3 and V4: a record without water still validates; an unsourced term is
  // null, never zero, and the total, range and comparison follow it to null.
  const nullBlock = structuredClone(waterExample);
  nullBlock.water = {
    ...nullBlock.water, waterL: null, gridL: null, rangeL: null, comparison: null, gridWaterLPerKWh: null,
  };
  if (validate(nullBlock) && waterProblems(nullBlock).length === 0) {
    console.log("  ok    V4 an unsourced grid term is null and the total, range and comparison follow it");
    pass++;
  } else {
    console.error("  FAIL  V4 null block should conform");
    fail++;
  }
  const noWater = structuredClone(waterExample);
  delete noWater.water;
  if (validate(noWater)) {
    console.log("  ok    V3 a record without water still validates");
    pass++;
  } else {
    console.error("  FAIL  V3 a record without water must validate");
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} example expectations met`);
if (fail > 0) process.exit(1);

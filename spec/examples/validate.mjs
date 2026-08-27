#!/usr/bin/env node
// AIEDS spec example conformance script - CC BY 4.0 rand0m.ai
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

console.log(`\n${pass}/${pass + fail} example expectations met`);
if (fail > 0) process.exit(1);

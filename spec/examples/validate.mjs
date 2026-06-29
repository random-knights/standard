#!/usr/bin/env node
// AIEDS spec example conformance script — CC BY 4.0 rand0m.ai
// Run from the spec/ directory: node examples/validate.mjs
// Validates all bundled disclosures against aieds.schema.json.

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);

const schema = JSON.parse(
  readFileSync(resolve(__dirname, "../aieds.schema.json"), "utf-8"),
);
const validate = ajv.compile(schema);

const examples = [
  "disclosure-model-inference.json",
  "disclosure-agent-session.json",
  "disclosure-app-monthly.json",
];

let pass = 0;
let fail = 0;

for (const name of examples) {
  const data = JSON.parse(
    readFileSync(resolve(__dirname, name), "utf-8"),
  );
  const ok = validate(data);
  if (ok) {
    console.log(`  ok  ${name}`);
    pass++;
  } else {
    console.error(`  FAIL  ${name}`);
    for (const err of validate.errors ?? []) {
      console.error(`       ${err.instancePath || "(root)"} — ${err.message}`);
    }
    fail++;
  }
}

console.log(`\n${pass}/${pass + fail} examples conform to aieds.schema.json`);
if (fail > 0) process.exit(1);

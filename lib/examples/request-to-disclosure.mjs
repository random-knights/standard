// AIEDS reference library — "request in, disclosure out" runnable samples.
//
//   cd lib && npm install && npm run build && node examples/request-to-disclosure.mjs
//
// Sample 1 mirrors what an app records after one chat completion; Sample 2 is
// a batch/monthly rollup disclosed with "modeled" confidence.
import { disclosureFromResponse } from "../dist/index.js";

// ── Sample 1: one chat response ──────────────────────────────────────────────
const chatResponse = {
  provider: "GoogleAI",
  model: "gemini-2.0-flash",
  latencyMs: 1180,
  inputTokens: 412,
  outputTokens: 890,
  costUsd: 0.0031,
  carbonGrams: 0.62, // provider/client CO2e estimate for this response
};
console.log("── one chat response ──");
console.log(JSON.stringify(disclosureFromResponse(chatResponse), null, 2));

// ── Sample 2: an app's monthly rollup ────────────────────────────────────────
const monthlyRollup = {
  provider: "rand0m.ai (all providers)",
  inputTokens: 1_250_000,
  outputTokens: 2_400_000,
  costUsd: 41.2,
  carbonGrams: 1870, // summed modeled CO2e across the month
  confidence: "modeled",
};
console.log("\n── monthly rollup ──");
console.log(JSON.stringify(disclosureFromResponse(monthlyRollup), null, 2));

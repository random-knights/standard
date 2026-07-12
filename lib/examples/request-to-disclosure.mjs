// AIEDS reference library - "request in, disclosure out" runnable samples.
//
//   cd lib && npm install && npm run build && node examples/request-to-disclosure.mjs
//
// ENERGY-FIRST (methodology 2.0.0): you pass tokens + model; the library models
// energy from the per-model coefficient table and DERIVES carbon from it. No
// carbon input. Sample 1 is a vendor-published model (Gemini); Sample 2 is a
// model not in the table, to show the honest "unknown" confidence tier.
import { disclosureFromResponse } from "../dist/index.js";

// -- Sample 1: one chat response, vendor-published coefficient ---------------
const chatResponse = {
  provider: "GoogleAI",
  model: "gemini-2.0-flash",
  latencyMs: 1180,
  inputTokens: 412,
  outputTokens: 890,
  costUsd: 0.0031,
};
console.log("-- one chat response (gemini: vendor-published) --");
console.log(JSON.stringify(disclosureFromResponse(chatResponse), null, 2));

// -- Sample 2: a model not in the table -> unknown tier, labeled so ----------
const unknownModel = {
  provider: "OtherAI",
  model: "some-model-v3",
  inputTokens: 412,
  outputTokens: 890,
};
console.log("\n-- same tokens, unlisted model (unknown tier) --");
console.log(JSON.stringify(disclosureFromResponse(unknownModel), null, 2));

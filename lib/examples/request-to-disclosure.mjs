// AiEDs reference library - "request in, disclosure out" runnable samples.
//
//   cd lib && npm install && npm run build && node examples/request-to-disclosure.mjs
//
// ENERGY-FIRST (methodology 2.1.0): you pass tokens + model; the library models
// energy from the per-model coefficient table and DERIVES carbon from it. No
// carbon input. Sample 1 is a vendor-published coefficient (Gemini); Sample 2 is
// a model not in the table, to show the honest "unknown" provenance rung.
// Sample 3 shows a cached prefill and the schema record the library builds.
import {
  disclosureFromResponse,
  schemaRecordFromDisclosure,
} from "../dist/index.js";

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

// -- Sample 2: a model not in the table -> unknown rung, labeled so ----------
const unknownModel = {
  provider: "OtherAI",
  model: "some-model-v3",
  inputTokens: 412,
  outputTokens: 890,
};
console.log("\n-- same tokens, unlisted model (unknown provenance) --");
console.log(JSON.stringify(disclosureFromResponse(unknownModel), null, 2));

// -- Sample 3: a cached prefill, and the record a validator accepts ----------
// methodology 2.4.1: cache-creation and cache-read tokens are input, counted at
// the full input coefficient. The breakdown is published beside the total and
// never changes it.
const cached = disclosureFromResponse({
  provider: "Anthropic",
  model: "claude-3-5-sonnet",
  inputTokenBreakdown: { plain: 412, cacheCreation: 0, cacheRead: 8000 },
  outputTokens: 890,
});
console.log("\n-- cached prefill: breakdown beside the total --");
console.log(JSON.stringify(cached, null, 2));

// The schema record is the subset spec/aieds.schema.json validates. The
// breakdown is deliberately not carried: `compute` is closed and has no field
// for it until the 2.2.0 schema revision.
console.log("\n-- the same disclosure as a schema record --");
console.log(
  JSON.stringify(
    schemaRecordFromDisclosure(cached, {
      id: "aieds:example:inference:2026-09-12:001",
      subject: { kind: "model", name: "claude-3-5-sonnet" },
      scope: "inference",
      window: "PT1S",
      source: "@random-knights/aieds-reference",
      generatedAt: "2026-09-12T00:00:00Z",
    }),
    null,
    2,
  ),
);

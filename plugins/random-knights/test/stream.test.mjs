// stream:true. Ollama and OpenAI-compatible servers put the token counts in the
// FINAL chunk of a streamed reply. The fixture is a real Ollama 0.40.4 stream
// (llama3.2:1b) with the reply text replaced by "x".
import assert from "node:assert/strict";
import test from "node:test";

import { callFromUsage, ollamaChat, usageFromStream } from "../scripts/wrappers.mjs";
import { fixtureText } from "./helpers.mjs";

const stream = fixtureText("ollama-stream.ndjson");

test("stream: the final Ollama chunk's counts are the receipt's counts", () => {
  const u = usageFromStream(stream);
  const final = JSON.parse(stream.trim().split("\n").at(-1));
  assert.equal(u.inputTokens, final.prompt_eval_count);
  assert.equal(u.outputTokens, final.eval_count);
  assert.equal(u.cachedTokens, final.prompt_eval_cached_count);
  assert.equal(u.model, "llama3.2:1b");
  assert.deepEqual([u.inputTokens, u.outputTokens], [28, 3], "the numbers the real run reported");
});

test("stream: OpenAI-compatible server-sent events with include_usage", () => {
  const sse = [
    'data: {"model":"m1","choices":[{"delta":{"content":"hi"}}],"usage":null}',
    "",
    'data: {"model":"m1","choices":[],"usage":{"prompt_tokens":120,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":100}}}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  const u = usageFromStream(sse);
  assert.deepEqual([u.inputTokens, u.outputTokens, u.cachedTokens, u.model], [120, 7, 100, "m1"]);
});

test("stream: no counts anywhere is undefined, not zero", () => {
  assert.equal(usageFromStream('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n'), undefined);
  assert.equal(usageFromStream(""), undefined);
  assert.equal(usageFromStream("not json at all"), undefined);
});

test("stream: a whole JSON body still works, and the last counts win", () => {
  assert.equal(usageFromStream(JSON.stringify({ model: "m", usage: { prompt_tokens: 5, completion_tokens: 2 } })).inputTokens, 5);
  const twice = '{"prompt_eval_count":1,"eval_count":1,"done":false}\n{"prompt_eval_count":9,"eval_count":4,"done":true}\n';
  assert.equal(usageFromStream(twice).inputTokens, 9);
});

test("ollamaChat stream:true reads the final chunk across arbitrary byte boundaries", async () => {
  const bytes = new TextEncoder().encode(stream);
  // Cut the body into 7-byte pieces so JSON lines split mid-token.
  const parts = [];
  for (let i = 0; i < bytes.length; i += 7) parts.push(bytes.slice(i, i + 7));
  const body = (async function* () {
    for (const p of parts) yield p;
  })();
  let seenBody;
  const fetchImpl = async (url, init) => {
    seenBody = JSON.parse(init.body);
    assert.ok(String(url).endsWith("/api/chat"));
    return { ok: true, status: 200, body };
  };
  const pieces = [];
  const r = await ollamaChat({ host: "127.0.0.1:11434", model: "llama3.2:1b", prompt: "hello", stream: true, onText: (t) => pieces.push(t) }, fetchImpl);
  assert.equal(seenBody.stream, true);
  assert.equal(r.text, "xx");
  assert.deepEqual(pieces, ["x", "x"]);
  assert.deepEqual([r.usage.inputTokens, r.usage.outputTokens], [28, 3]);
  assert.match(r.receipt, /^this response {3}~.* Wh, /m);
  assert.equal(callFromUsage(r.usage).usage.output_tokens, 3);
});

test("ollamaChat stream:true with no final chunk says so instead of printing a zero", async () => {
  const first = stream.split("\n")[0] + "\n";
  const fetchImpl = async () => ({ ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode(first); })() });
  await assert.rejects(() => ollamaChat({ model: "m", prompt: "p", stream: true }, fetchImpl), /no token counts/);
});

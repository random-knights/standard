// Tests for the library-and-wrapper paths (Ollama, OpenAI-compatible chat
// completions such as Hugging Face Inference Providers, and raw token counts).
//
// These paths have no hook: a caller hands over a response that carries its own
// token counts. The tests use response bodies of the shape each service
// documents and a local HTTP server standing in for the user's own Ollama.
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { disclosureFromResponse } from "../vendor/lib/dist/index.js";
import { REQUIRED_COPY } from "../scripts/core.mjs";
import {
  ollamaBaseUrl,
  ollamaChat,
  receiptTextFromUsage,
  usageFromChatCompletion,
  usageFromOllama,
} from "../scripts/wrappers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(resolve(here, ".."), "scripts", "aieds.mjs");
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

function run(args, input, { env = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

function approx(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} !== ${expected}`,
  );
}

// An Ollama /api/chat response body, in the shape Ollama 0.34.4 returns.
const OLLAMA_BODY = {
  model: "llama3.2:1b",
  created_at: "2026-01-01T00:00:00Z",
  message: { role: "assistant", content: "CANARY_REPLY_TEXT" },
  done: true,
  done_reason: "stop",
  total_duration: 1,
  load_duration: 1,
  prompt_eval_count: 51,
  prompt_eval_cached_count: 50,
  prompt_eval_duration: 1,
  eval_count: 107,
  eval_duration: 1,
};

// An OpenAI-compatible chat completion, as Hugging Face's router returns.
const CHAT_BODY = {
  id: "chatcmpl-FIXTURE",
  object: "chat.completion",
  model: "meta-llama/Llama-3.1-8B-Instruct",
  choices: [{ index: 0, message: { role: "assistant", content: "CANARY_REPLY_TEXT" } }],
  usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
};

function libraryWh(provider, model, inputTokens, outputTokens) {
  return disclosureFromResponse({ provider, model, inputTokens, outputTokens }).energyWh;
}

function whOf(receiptText) {
  const m = /receipt: ([0-9.]+) Wh/.exec(receiptText);
  assert.ok(m, `no Wh figure in: ${receiptText}`);
  return Number(m[1]);
}

// -- usage readers ------------------------------------------------------------

test("ollama: prompt_eval_count is the whole prompt, the cached count is part of it", () => {
  const u = usageFromOllama(OLLAMA_BODY);
  assert.deepEqual(u, {
    model: "llama3.2:1b",
    inputTokens: 51,
    outputTokens: 107,
    cachedTokens: 50,
  });
  assert.equal(usageFromOllama({ model: "x", message: {} }), undefined);
  assert.equal(usageFromOllama(null), undefined);
});

test("chat completion: prompt and completion tokens, cached tokens when present", () => {
  assert.deepEqual(usageFromChatCompletion(CHAT_BODY), {
    model: "meta-llama/Llama-3.1-8B-Instruct",
    inputTokens: 120,
    outputTokens: 40,
    cachedTokens: 0,
  });
  const withCache = {
    ...CHAT_BODY,
    usage: { ...CHAT_BODY.usage, prompt_tokens_details: { cached_tokens: 100 } },
  };
  assert.equal(usageFromChatCompletion(withCache).cachedTokens, 100);
  // A Responses-style usage block works too.
  assert.deepEqual(
    usageFromChatCompletion({ model: "m", usage: { input_tokens: 7, output_tokens: 3 } }),
    { model: "m", inputTokens: 7, outputTokens: 3, cachedTokens: 0 },
  );
  assert.equal(usageFromChatCompletion({ model: "m" }), undefined);
  assert.equal(usageFromChatCompletion({ usage: { prompt_tokens: 1 } }), undefined);
});

// -- receipt text ---------------------------------------------------------------

test("receipt: figures equal the library, cached tokens never change them", () => {
  const plain = receiptTextFromUsage({
    provider: "Hugging Face",
    model: "meta-llama/Llama-3.1-8B-Instruct",
    inputTokens: 120,
    outputTokens: 40,
  });
  const cached = receiptTextFromUsage({
    provider: "Hugging Face",
    model: "meta-llama/Llama-3.1-8B-Instruct",
    inputTokens: 120,
    outputTokens: 40,
    cachedTokens: 100,
  });
  const want = libraryWh("Hugging Face", "meta-llama/Llama-3.1-8B-Instruct", 120, 40);
  approx(whOf(plain), Number(want.toFixed(4)), "Wh");
  assert.equal(whOf(plain), whOf(cached));
  assert.match(cached, /120 in \(100 cache read, 0 cache write\), 40 out/);
  for (const sentence of REQUIRED_COPY) assert.ok(plain.includes(sentence));
  assert.doesNotMatch(plain, /offset/i);
  assert.ok(!plain.includes(EM_DASH) && !plain.includes(EN_DASH));
});

test("receipt: a listed model says its provenance, an unlisted one says class estimate", () => {
  const listed = receiptTextFromUsage({
    provider: "OpenAI",
    model: "gpt-5.4",
    inputTokens: 10,
    outputTokens: 5,
  });
  assert.match(listed, /vendor-published, low confidence/);
  const unlisted = receiptTextFromUsage({
    provider: "Ollama",
    model: "llama3.2:1b",
    inputTokens: 10,
    outputTokens: 5,
  });
  assert.match(unlisted, /class estimate \(model not in the coefficient table\), low confidence/);
});

// -- ollama --------------------------------------------------------------------

test("ollama: OLLAMA_HOST style values are normalized, other schemes refused", () => {
  assert.equal(ollamaBaseUrl(undefined), "http://127.0.0.1:11434");
  assert.equal(ollamaBaseUrl("127.0.0.1:11434"), "http://127.0.0.1:11434");
  assert.equal(ollamaBaseUrl("http://box.local:9/"), "http://box.local:9");
  assert.throws(() => ollamaBaseUrl("file:///etc/passwd"));
});

test("ollama: one request to the named host, receipt from the response's counts", async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => OLLAMA_BODY };
  };
  const r = await ollamaChat(
    { host: "10.0.0.5:11434", model: "llama3.2:1b", prompt: "CANARY_PROMPT", numCtx: 2048 },
    fakeFetch,
  );
  assert.equal(seen.length, 1, "exactly one request");
  assert.equal(seen[0].url, "http://10.0.0.5:11434/api/chat");
  assert.equal(seen[0].body.stream, false);
  assert.deepEqual(seen[0].body.options, { num_ctx: 2048 });
  assert.equal(r.text, "CANARY_REPLY_TEXT");
  assert.match(r.receipt, /51 in \(50 cache read, 0 cache write\), 107 out/);
  assert.doesNotMatch(r.receipt, /CANARY_/);
  approx(whOf(r.receipt), Number(libraryWh("Ollama", "llama3.2:1b", 51, 107).toFixed(4)), "Wh");
});

test("ollama: a response without counts is an error, not a zero receipt", async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ message: {} }) });
  await assert.rejects(
    ollamaChat({ model: "m", prompt: "p" }, fakeFetch),
    /no token counts/,
  );
  const failing = async () => ({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(ollamaChat({ model: "m", prompt: "p" }, failing), /HTTP 404/);
});

test("ollama CLI: end to end against a local server, prints the reply then the receipt", async () => {
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    req.resume();
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(OLLAMA_BODY));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const host = `http://127.0.0.1:${server.address().port}`;
    const r = await run(["ollama", "--model", "llama3.2:1b", "--host", host, "hello", "there"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^CANARY_REPLY_TEXT\n/);
    assert.match(r.stdout, /AiEDs receipt: .* \(this response\)\./);
    assert.match(r.stdout, /51 in \(50 cache read, 0 cache write\), 107 out/);
    assert.equal(hits, 1);

    const quiet = await run(["ollama", "--model", "m", "--host", host, "--no-text", "hi"]);
    assert.doesNotMatch(quiet.stdout, /CANARY_/);
    assert.match(quiet.stdout, /^AiEDs receipt:/);

    const noModel = await run(["ollama", "--host", host, "hi"], undefined, {
      env: { OLLAMA_MODEL: "" },
    });
    assert.equal(noModel.code, 2);
  } finally {
    server.close();
  }
});

test("ollama CLI: an unreachable host fails with a message and no receipt", async () => {
  const r = await run(["ollama", "--model", "m", "--host", "http://127.0.0.1:1", "hi"]);
  assert.notEqual(r.code, 0);
  assert.equal(r.stdout, "");
  assert.ok(r.stderr.length > 0);
});

// -- chat-completion and usage CLIs ----------------------------------------------

test("chat-completion CLI: reads a response from stdin and labels the provider", async () => {
  const r = await run(
    ["chat-completion", "--provider", "Hugging Face"],
    JSON.stringify(CHAT_BODY),
  );
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /120 in, 40 out/);
  assert.match(r.stdout, /meta-llama\/Llama-3\.1-8B-Instruct/);
  assert.doesNotMatch(r.stdout, /CANARY_/);
  for (const sentence of REQUIRED_COPY) assert.ok(r.stdout.includes(sentence));
});

test("chat-completion CLI: no usage block is an error, never a zero receipt", async () => {
  const r = await run(["chat-completion"], JSON.stringify({ model: "m", choices: [] }));
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  const bad = await run(["chat-completion"], "not json");
  assert.equal(bad.code, 1);
});

test("usage CLI: raw token counts give a receipt, bad input a usage line", async () => {
  const r = await run([
    "usage", "--provider", "Hugging Face", "--model", "x/y", "--input", "1000", "--output", "250", "--cached", "400",
  ]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /1,000 in \(400 cache read, 0 cache write\), 250 out/);
  approx(whOf(r.stdout), Number(libraryWh("Hugging Face", "x/y", 1000, 250).toFixed(4)), "Wh");

  const missing = await run(["usage", "--model", "x"]);
  assert.equal(missing.code, 2);
  const nan = await run(["usage", "--model", "x", "--input", "abc", "--output", "1"]);
  assert.equal(nan.code, 2);
});

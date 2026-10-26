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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { disclosureFromResponse } from "../vendor/lib/dist/index.js";
import { disclose, formatEnergy } from "../scripts/core.mjs";
import {
  callFromUsage,
  ollamaBaseUrl,
  ollamaChat,
  receiptTextFromUsage,
  usageFromChatCompletion,
  usageFromOllama,
} from "../scripts/wrappers.mjs";

// Every child process gets its own config folder, so the local account
// total a receipt writes never lands in the real user config.
const TEST_CONFIG_DIR = mkdtempSync(join(tmpdir(), "rk test config "));
process.on("exit", () => rmSync(TEST_CONFIG_DIR, { recursive: true, force: true }));

const here = dirname(fileURLToPath(import.meta.url));
const script = join(resolve(here, ".."), "scripts", "aieds.mjs");
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

function run(args, input, { env = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, AIEDS_CONFIG_DIR: TEST_CONFIG_DIR, ...env },
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

// The receipt prints the energy at one figure (low confidence), so the figure
// the library computed must appear in exactly that rounding. `wh` is the
// short receipt's count: cache reads left out.
function assertWh(receiptText, wh, label) {
  assert.ok(
    receiptText.includes(`this response   ${formatEnergy(wh)}, `),
    `${label}: ${formatEnergy(wh)} not in: ${receiptText}`,
  );
}

const BASIS = "A guess, not a measurement. Cached text counted as free. Comparisons are for scale only.";

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

test("receipt: figures equal the library, and cached tokens count as free on the receipt", () => {
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
  assertWh(plain, libraryWh("Hugging Face", "meta-llama/Llama-3.1-8B-Instruct", 120, 40), "plain");
  // 100 of the 120 input tokens are cache reads: only 20 are charged.
  assertWh(cached, libraryWh("Hugging Face", "meta-llama/Llama-3.1-8B-Instruct", 20, 40), "cached");
  assert.notEqual(plain, cached);
  // The ratified count still charges them: the record a sync sends is unchanged.
  const call = callFromUsage({ provider: "Hugging Face", model: "meta-llama/Llama-3.1-8B-Instruct", inputTokens: 120, outputTokens: 40, cachedTokens: 100 });
  approx(disclose([call]).energyWh, libraryWh("Hugging Face", "meta-llama/Llama-3.1-8B-Instruct", 120, 40), "ratified");
  for (const text of [plain, cached]) {
    assert.doesNotMatch(text, /tokens|cache read|%/, "no tokens line on the short receipt");
  }
  assert.doesNotMatch(plain, /offset/i);
  assert.ok(!plain.includes(EM_DASH) && !plain.includes(EN_DASH));
});

test("receipt: a listed model gets the plain basis line, an unlisted one says there is no published figure", () => {
  const listed = receiptTextFromUsage({
    provider: "OpenAI",
    model: "gpt-5.4",
    inputTokens: 10,
    outputTokens: 5,
  });
  assert.equal(listed.split("\n").at(-1), BASIS);
  const unlisted = receiptTextFromUsage({
    provider: "Ollama",
    model: "llama3.2:1b",
    inputTokens: 10,
    outputTokens: 5,
  });
  assert.equal(unlisted.split("\n").at(-1), `${BASIS} No published figure for llama3.2:1b, so a general guess is used.`);
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
  // 51 in, 50 of them cached, 107 out: the receipt charges 1 in and 107 out.
  assert.deepEqual([r.usage.inputTokens, r.usage.cachedTokens, r.usage.outputTokens], [51, 50, 107]);
  assert.doesNotMatch(r.receipt, /CANARY_/);
  assertWh(r.receipt, libraryWh("Ollama", "llama3.2:1b", 1, 107), "ollama");
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
    assert.match(r.stdout, /^this response {3}~.* Wh, ~.* g CO2e, ~.* water, ~.* tree-time$/m);
    assertWh(r.stdout, libraryWh("Ollama", "llama3.2:1b", 1, 107), "ollama CLI");
    assert.equal(hits, 1);

    const quiet = await run(["ollama", "--model", "m", "--host", host, "--no-text", "hi"]);
    assert.doesNotMatch(quiet.stdout, /CANARY_/);
    assert.match(quiet.stdout, /^this response {3}/);

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
  assert.match(r.stdout, / No published figure for meta-llama\/Llama-3\.1-8B-Instruct, so a general guess is used\.$/m);
  assertWh(r.stdout, libraryWh("Hugging Face", "meta-llama/Llama-3.1-8B-Instruct", 120, 40), "chat-completion");
  assert.doesNotMatch(r.stdout, /CANARY_/);
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
  // 1000 in, 400 of them cached: the receipt charges 600 in and 250 out.
  assertWh(r.stdout, libraryWh("Hugging Face", "x/y", 600, 250), "usage");

  const missing = await run(["usage", "--model", "x"]);
  assert.equal(missing.code, 2);
  const nan = await run(["usage", "--model", "x", "--input", "abc", "--output", "1"]);
  assert.equal(nan.code, 2);
});

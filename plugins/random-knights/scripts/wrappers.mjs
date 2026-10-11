// Library-and-wrapper paths for tools that have no hook mechanism.
//
// Ollama and Hugging Face give a hook nothing to attach to, but every chat
// response they return carries its own token counts. These helpers turn those
// counts into an AiEDs receipt with the same library and the same formatter as
// the hook paths. They are NOT a plugin install: the user (or a script) calls
// them with a response in hand.
//
// What is read: the model name and the token counters of one response. The
// text of a prompt or a response is never put into a receipt. The only network
// call in this file is ollamaChat(), and it goes to the endpoint the user
// names (default: the local Ollama server).

import { disclose, formatResponseReceipt } from "./core.mjs";

function count(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/**
 * Builds the receipt text for one response.
 *
 * `inputTokens` is the whole prompt, cached tokens included. `cachedTokens` is
 * the part of it that was served from a cache; it is carved out as cache read,
 * which the library counts at the full input rate (methodology 2.4.1), so the
 * split never changes the figures. A model the library does not list gets the
 * frontier-class estimate and the receipt says so.
 */
export function receiptTextFromUsage({
  provider,
  model,
  inputTokens,
  outputTokens,
  cachedTokens = 0,
}) {
  const input = count(inputTokens);
  const cached = Math.min(count(cachedTokens), input);
  const d = disclose([
    {
      id: "wrapper-0",
      model: typeof model === "string" ? model : "",
      provider: typeof provider === "string" && provider.length > 0 ? provider : "Other",
      turn: 1,
      count: 1,
      usage: {
        input_tokens: input - cached,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: cached,
        output_tokens: count(outputTokens),
      },
    },
  ]);
  return formatResponseReceipt(d);
}

/**
 * Reads the counters out of an OpenAI-compatible chat completion (the shape
 * Hugging Face Inference Providers, Ollama's /v1 endpoint and many others
 * return) or a Responses-style usage block. Returns undefined when no usage
 * block with a prompt and a completion count is present, so the caller can say
 * so instead of printing a zero.
 */
export function usageFromChatCompletion(json) {
  if (json === null || typeof json !== "object") return undefined;
  const u = json.usage;
  if (u === null || typeof u !== "object") return undefined;
  const input = u.prompt_tokens ?? u.input_tokens;
  const output = u.completion_tokens ?? u.output_tokens;
  if (typeof input !== "number" || typeof output !== "number") return undefined;
  const cached =
    u.prompt_tokens_details?.cached_tokens ??
    u.input_tokens_details?.cached_tokens ??
    0;
  return {
    model: typeof json.model === "string" ? json.model : "",
    inputTokens: input,
    outputTokens: output,
    cachedTokens: cached,
  };
}

/**
 * Reads the counters out of an Ollama /api/chat or /api/generate response
 * (checked on Ollama 0.34.4). `prompt_eval_count` is the whole prompt and
 * `prompt_eval_cached_count`, when present, is the part of it that was reused
 * from the KV cache. `eval_count` is the output.
 */
export function usageFromOllama(json) {
  if (json === null || typeof json !== "object") return undefined;
  if (typeof json.prompt_eval_count !== "number" || typeof json.eval_count !== "number") {
    return undefined;
  }
  return {
    model: typeof json.model === "string" ? json.model : "",
    inputTokens: json.prompt_eval_count,
    outputTokens: json.eval_count,
    cachedTokens:
      typeof json.prompt_eval_cached_count === "number" ? json.prompt_eval_cached_count : 0,
  };
}

/** Normalizes OLLAMA_HOST style values ("127.0.0.1:11434", "http://host:port"). */
export function ollamaBaseUrl(value) {
  const raw =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : "http://127.0.0.1:11434";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("the Ollama host must be an http or https URL");
  }
  return `${url.protocol}//${url.host}`;
}

/**
 * One non-streaming chat call to the user's own Ollama endpoint. Returns the
 * reply text and the receipt. `fetchImpl` is injectable for tests.
 */
export async function ollamaChat(
  { host, model, prompt, numCtx },
  fetchImpl = globalThis.fetch,
) {
  const body = {
    model,
    stream: false,
    messages: [{ role: "user", content: prompt }],
  };
  if (Number.isInteger(numCtx) && numCtx > 0) body.options = { num_ctx: numCtx };
  const res = await fetchImpl(`${ollamaBaseUrl(host)}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama answered HTTP ${res.status}`);
  const json = await res.json();
  const usage = usageFromOllama(json);
  if (usage === undefined) {
    throw new Error("the Ollama response carried no token counts, so no receipt can be built");
  }
  const text = typeof json.message?.content === "string" ? json.message.content : "";
  return {
    text,
    receipt: receiptTextFromUsage({
      provider: "Ollama",
      model: usage.model || model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
    }),
  };
}

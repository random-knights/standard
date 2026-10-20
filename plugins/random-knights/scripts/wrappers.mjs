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
export function callFromUsage({
  provider,
  model,
  inputTokens,
  outputTokens,
  cachedTokens = 0,
}) {
  const input = count(inputTokens);
  const cached = Math.min(count(cachedTokens), input);
  return {
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
  };
}

export function receiptTextFromUsage(usage) {
  return formatResponseReceipt(disclose([callFromUsage(usage)]));
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

/**
 * Reads the final counters out of a STREAMED response, whatever its framing:
 *
 *   Ollama /api/chat with stream:true   newline-delimited JSON; the last chunk
 *                                       (done: true) carries prompt_eval_count,
 *                                       eval_count and prompt_eval_cached_count
 *   OpenAI-compatible server-sent       "data: {...}" lines; with
 *   events                              stream_options.include_usage the last
 *                                       chunk before [DONE] carries `usage`
 *   a plain JSON body                   the non-streaming shapes above
 *
 * Only the counters and the model name are read; chunk text is ignored. The
 * LAST chunk that carries counters wins, because a stream may repeat them.
 * Returns undefined when no chunk has counters, so the caller says so instead
 * of printing a zero.
 */
export function usageFromStream(text) {
  const whole = String(text).trim();
  if (whole.length === 0) return undefined;
  try {
    const one = JSON.parse(whole);
    const direct = usageFromOllama(one) ?? usageFromChatCompletion(one);
    if (direct !== undefined) return direct;
  } catch {
    // not one JSON document: fall through to line framing
  }
  let found;
  let model = "";
  for (const raw of whole.split(/\r?\n/)) {
    let line = raw.trim();
    if (line.length === 0 || line.startsWith(":")) continue;
    if (line.startsWith("data:")) line = line.slice(5).trim();
    if (line === "[DONE]") continue;
    let chunk;
    try {
      chunk = JSON.parse(line);
    } catch {
      continue;
    }
    if (chunk === null || typeof chunk !== "object") continue;
    if (typeof chunk.model === "string" && chunk.model.length > 0) model = chunk.model;
    const u = usageFromOllama(chunk) ?? usageFromChatCompletion(chunk);
    if (u !== undefined) found = u;
  }
  if (found === undefined) return undefined;
  return { ...found, model: found.model || model };
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
 * One chat call to the user's own Ollama endpoint. Returns the reply text and
 * the receipt. With `stream: true` the reply arrives as newline-delimited JSON
 * chunks, `onText` is called with each piece of text as it arrives, and the
 * counters come from the final (done: true) chunk. `fetchImpl` is injectable
 * for tests.
 */
export async function ollamaChat(
  { host, model, prompt, numCtx, stream = false, onText },
  fetchImpl = globalThis.fetch,
) {
  const body = {
    model,
    stream: stream === true,
    messages: [{ role: "user", content: prompt }],
  };
  if (Number.isInteger(numCtx) && numCtx > 0) body.options = { num_ctx: numCtx };
  const res = await fetchImpl(`${ollamaBaseUrl(host)}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama answered HTTP ${res.status}`);

  let text = "";
  let usage;
  if (stream === true) {
    const decoder = new TextDecoder();
    let pending = "";
    let final;
    const take = (line) => {
      if (line.trim().length === 0) return;
      let chunk;
      try {
        chunk = JSON.parse(line);
      } catch {
        return;
      }
      const piece = chunk?.message?.content;
      if (typeof piece === "string" && piece.length > 0) {
        text += piece;
        if (typeof onText === "function") onText(piece);
      }
      if (chunk?.done === true) final = chunk;
    };
    for await (const part of res.body) {
      pending += decoder.decode(part, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) take(line);
    }
    pending += decoder.decode();
    take(pending);
    usage = final === undefined ? undefined : usageFromOllama(final);
  } else {
    const json = await res.json();
    usage = usageFromOllama(json);
    text = typeof json.message?.content === "string" ? json.message.content : "";
  }
  if (usage === undefined) {
    throw new Error("the Ollama response carried no token counts, so no receipt can be built");
  }
  const used = {
    provider: "Ollama",
    model: usage.model || model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.cachedTokens,
  };
  return { text, receipt: receiptTextFromUsage(used), usage: used };
}

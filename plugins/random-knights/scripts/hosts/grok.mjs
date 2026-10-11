// Grok Build session reader.
//
// Checked against Grok Build 1.0.13. Grok does not document its session file
// as a stable interface, so this reader returns zero calls for anything it does
// not recognize and the caller then prints nothing. It never guesses.

import { count, jsonLines } from "./util.mjs";

/** The Grok Build version this reader was checked against. */
export const TESTED_GROK_VERSION = "1.0.13";

function providerLabel(model) {
  return /^grok/i.test(String(model)) ? "xAI" : "Other";
}

/** True for one parsed JSONL record in Grok's session-update shape. */
export function looksLikeGrok(entry) {
  return (
    typeof entry.method === "string" &&
    entry.params !== null &&
    typeof entry.params === "object" &&
    entry.params.update !== null &&
    typeof entry.params.update === "object"
  );
}

/**
 * Grok Build session (<GROK_HOME>/sessions/<cwd>/<session id>/updates.jsonl).
 * Each finished prompt appends one update:
 *
 *   params.update.sessionUpdate = "turn_completed"
 *   params.update.prompt_id
 *   params.update.usage = { inputTokens, outputTokens, cachedReadTokens,
 *                           cacheCreationTokens, modelCalls,
 *                           modelUsage: { <model id>: { ...same fields } } }
 *
 * `inputTokens` is the full prompt: it includes the cached tokens, so plain
 * input is inputTokens - cachedReadTokens - cacheCreationTokens. `modelUsage`
 * splits a prompt that used more than one model (a subagent, for example) and
 * is preferred over the prompt total so each model gets its own coefficient.
 * A repeated prompt_id replaces the earlier record, and a prompt that carries
 * no tokens (a cancelled one) is not a model call.
 *
 * TIMING, observed on 1.0.13: the `turn_completed` record of a response that
 * ends normally is written AFTER that response's Stop hooks have returned. A
 * Stop hook therefore sees every earlier response and not its own. The hook
 * path checks for its own prompt id and stays silent when it is absent.
 */
export function parseGrokSession(text) {
  const byPrompt = new Map();
  const order = [];

  const wanted = (line) => line.includes('"turn_completed"');

  for (const entry of jsonLines(text, wanted)) {
    const u = entry.params?.update;
    if (u === null || typeof u !== "object") continue;
    if (u.sessionUpdate !== "turn_completed") continue;
    const usage = u.usage;
    if (usage === null || typeof usage !== "object") continue;

    const perModel =
      usage.modelUsage !== null && typeof usage.modelUsage === "object"
        ? Object.entries(usage.modelUsage)
        : [];
    const rows = (perModel.length > 0 ? perModel : [["", usage]]).filter(
      ([, m]) =>
        m !== null &&
        typeof m === "object" &&
        count(m.inputTokens) + count(m.outputTokens) > 0,
    );
    if (rows.length === 0) continue;

    const key =
      typeof u.prompt_id === "string" && u.prompt_id.length > 0
        ? u.prompt_id
        : `turn-${order.length}`;
    if (!byPrompt.has(key)) order.push(key);
    const turnNumber = order.indexOf(key) + 1;
    byPrompt.set(
      key,
      rows.map(([model, m]) => {
        const input = count(m.inputTokens);
        const cached = Math.min(count(m.cachedReadTokens), input);
        const written = Math.min(count(m.cacheCreationTokens), input - cached);
        return {
          id: `${key}:${model}`,
          model,
          provider: providerLabel(model),
          turn: turnNumber,
          count: Math.max(1, count(m.modelCalls)),
          usage: {
            input_tokens: input - cached - written,
            cache_creation_input_tokens: written,
            cache_read_input_tokens: cached,
            output_tokens: count(m.outputTokens),
          },
        };
      }),
    );
  }

  const calls = [];
  for (const key of order) calls.push(...byPrompt.get(key));
  return { calls, lastTurn: order.length, lastAssistantText: "", host: "grok" };
}

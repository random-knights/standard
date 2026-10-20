// Codex CLI rollout reader.
//
// Checked against Codex CLI 0.159.2 and, on a real interactive session with the
// receipt shown, 0.162.1 (0.163.0 also ran the hook; its rollout was not
// captured). OpenAI documents the rollout as "not a
// stable interface for hooks and may change over time", so this reader returns
// zero calls for anything it does not recognize and the caller then prints
// nothing. It never guesses.

import { count, jsonLines, timeMs } from "./util.mjs";

/** The Codex CLI version this reader was checked against. */
export const TESTED_CODEX_VERSION = "0.162.1";

const RECORD_TYPES = new Set([
  "session_meta",
  "event_msg",
  "response_item",
  "turn_context",
  "token_usage_record",
  "world_state",
]);

/** True for one parsed JSONL record in Codex's rollout shape. */
export function looksLikeCodex(entry) {
  return (
    typeof entry.type === "string" &&
    RECORD_TYPES.has(entry.type) &&
    entry.payload !== null &&
    typeof entry.payload === "object"
  );
}

const PROVIDER_LABELS = new Map([
  ["openai", "OpenAI"],
  ["azure", "Azure OpenAI"],
]);

function providerLabel(id) {
  if (typeof id !== "string" || id.length === 0) return "OpenAI";
  return PROVIDER_LABELS.get(id.toLowerCase()) ?? id;
}

/**
 * Codex CLI rollout (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl). Usage
 * lives in `event_msg` records whose payload.type is `token_count`:
 *
 *   payload.info.last_token_usage   the model call that just finished
 *   payload.info.total_token_usage  the running total for the thread
 *
 * `input_tokens` already INCLUDES `cached_input_tokens` (the OpenAI
 * convention: total_tokens = input_tokens + output_tokens), and
 * `output_tokens` already includes `reasoning_output_tokens`. Codex repeats a
 * token_count record without a new model call, so a record whose running total
 * equals the previous one is a duplicate and is skipped. A record with
 * `info: null` carries rate-limit data only.
 *
 * The model comes from the latest `turn_context`; a turn starts at each
 * `task_started`, and the hook input's `turn_id` names the turn a Stop belongs
 * to. Codex's own "tokens used" line is input minus cached plus output.
 */
export function parseCodexRollout(text) {
  const calls = [];
  let provider = "OpenAI";
  let model = "";
  let turn = 0;
  let turnId = "";
  let lastTotalKey = "";
  let previousTotal;

  const wanted = (line) =>
    line.includes('"token_count"') ||
    line.includes('"turn_context"') ||
    line.includes('"task_started"') ||
    line.includes('"session_meta"');

  for (const entry of jsonLines(text, wanted)) {
    const p = entry.payload;
    if (p === null || typeof p !== "object") continue;

    if (entry.type === "session_meta") {
      provider = providerLabel(p.model_provider);
      continue;
    }
    if (entry.type === "turn_context") {
      if (typeof p.model === "string") model = p.model;
      if (typeof p.turn_id === "string") turnId = p.turn_id;
      continue;
    }
    if (entry.type !== "event_msg") continue;

    if (p.type === "task_started") {
      turn += 1;
      if (typeof p.turn_id === "string") turnId = p.turn_id;
      continue;
    }
    if (p.type !== "token_count") continue;

    const info = p.info;
    if (info === null || typeof info !== "object") continue;
    const total = info.total_token_usage;
    let last = info.last_token_usage;
    const totalKey = total ? JSON.stringify(total) : "";
    if (totalKey !== "" && totalKey === lastTotalKey) continue; // duplicate record

    if (last === null || typeof last !== "object") {
      // No per-call figure: fall back to the difference of running totals.
      if (total === null || typeof total !== "object") continue;
      const prev = previousTotal ?? {};
      last = {
        input_tokens: count(total.input_tokens) - count(prev.input_tokens),
        cached_input_tokens:
          count(total.cached_input_tokens) - count(prev.cached_input_tokens),
        cache_write_input_tokens:
          count(total.cache_write_input_tokens) -
          count(prev.cache_write_input_tokens),
        output_tokens: count(total.output_tokens) - count(prev.output_tokens),
      };
    }
    if (totalKey !== "") {
      lastTotalKey = totalKey;
      previousTotal = total;
    }

    const input = count(last.input_tokens);
    const cached = Math.min(count(last.cached_input_tokens), input);
    const written = Math.min(count(last.cache_write_input_tokens), input - cached);
    calls.push({
      id: `codex-${calls.length}`,
      model,
      provider,
      turn: Math.max(turn, 1),
      turnId,
      tsMs: timeMs(entry.timestamp),
      count: 1,
      usage: {
        input_tokens: input - cached - written,
        cache_creation_input_tokens: written,
        cache_read_input_tokens: cached,
        output_tokens: count(last.output_tokens),
      },
    });
  }

  return {
    calls,
    lastTurn: calls.length === 0 ? Math.max(turn, 0) : Math.max(turn, 1),
    lastAssistantText: "",
    host: "codex",
  };
}

// GitHub Copilot CLI usage reader.
//
// Checked against Copilot CLI 1.0.100 (npm install -g @github/copilot). The
// agentStop hook payload carries no token counts, but it names the session's
// own event file (transcriptPath, <copilot home>/session-state/<id>/events.jsonl)
// and that file holds one `session.usage_record` per model call with the real
// counts:
//
//   data.usage = { model, inputTokens, outputTokens, cacheReadTokens,
//                  cacheWriteTokens, reasoningTokens, ... }
//
// `inputTokens` INCLUDES the cache read and cache write tokens (checked against
// the session.shutdown totals: input = plain + cache read + cache write), and
// `outputTokens` is the total output (reasoning tokens are part of it).
//
// WHAT THIS READER TOUCHES. The same file also carries the conversation:
// user.message, assistant.message, model.messages_snapshot and tool output all
// hold text. This reader never parses any of that. It scans the file as BYTES,
// line by line, and decodes and parses only a line that contains the literal
// type name `session.usage_record` (or `session.shutdown`, for the totals check
// in the tests). From a parsed record it copies numbers, the model id and the
// time, and nothing else. Lines over MAX_LINE_BYTES are skipped unread.
//
// ONE RECEIPT PER TURN. The caller keeps a per-session read position (a byte count), so each
// agentStop reads only the records appended since the last one. The position
// moves only over complete lines.

import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { count, timeMs } from "./util.mjs";

/** The Copilot CLI version this reader was checked against. */
export const TESTED_COPILOT_VERSION = "1.0.100";

export const MAX_LINE_BYTES = 256 * 1024;
const MAX_READ_BYTES = 16 * 1024 * 1024;
const USAGE_MARK = Buffer.from('"session.usage_record"');
const SHUTDOWN_MARK = Buffer.from('"session.shutdown"');
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Copilot's home: COPILOT_HOME, else <home>/.copilot (%USERPROFILE%\.copilot on Windows). */
export function copilotHome(env = process.env) {
  const h = env.COPILOT_HOME;
  if (typeof h === "string" && h.trim().length > 0) return h.trim();
  return join(env.USERPROFILE && process.platform === "win32" ? env.USERPROFILE : homedir(), ".copilot");
}

export function isSafeCopilotSessionId(id) {
  return typeof id === "string" && SAFE_ID.test(id);
}

/**
 * Accepts only <anything>/session-state/<safe session id>/events.jsonl, so a
 * hook payload cannot point this reader at an arbitrary file.
 */
export function isCopilotEventsPath(p) {
  if (typeof p !== "string" || p.length === 0 || p.length > 1024) return false;
  const norm = p.replace(/\\/g, "/");
  const parts = norm.split("/");
  const n = parts.length;
  return (
    n >= 3 &&
    parts[n - 1] === "events.jsonl" &&
    isSafeCopilotSessionId(parts[n - 2]) &&
    parts[n - 3] === "session-state"
  );
}

/** <copilot home>/session-state/<id>/events.jsonl for a validated session id. */
export function copilotEventsPath(sessionId, env = process.env) {
  if (!isSafeCopilotSessionId(sessionId)) return undefined;
  return join(copilotHome(env), "session-state", sessionId, "events.jsonl");
}

function splitLines(buf) {
  // Yields [start, end) byte ranges of COMPLETE lines (ending in \n) only.
  const ranges = [];
  let start = 0;
  for (;;) {
    const nl = buf.indexOf(0x0a, start);
    if (nl < 0) break;
    ranges.push([start, nl]);
    start = nl + 1;
  }
  return { ranges, consumed: start };
}

function usageCall(rec, index) {
  const u = rec?.data?.usage;
  if (u === null || typeof u !== "object") return undefined;
  const model = typeof u.model === "string" ? u.model : "";
  const input = count(u.inputTokens);
  const output = count(u.outputTokens);
  if (input + output === 0) return undefined;
  const cached = Math.min(count(u.cacheReadTokens), input);
  const written = Math.min(count(u.cacheWriteTokens), input - cached);
  const seq = Number.isInteger(u.accounting?.sequence) ? u.accounting.sequence : undefined;
  return {
    id: seq !== undefined ? `copilot-seq-${seq}` : `copilot-${index}`,
    seq,
    model,
    provider: "GitHub Copilot",
    turn: 1,
    count: 1,
    tsMs: timeMs(rec.timestamp),
    usage: {
      input_tokens: input - cached - written,
      cache_creation_input_tokens: written,
      cache_read_input_tokens: cached,
      output_tokens: output,
    },
  };
}

/**
 * Reads the usage records appended to `path` since byte `startPos`.
 *
 * Returns { calls, nextPos, size }. `nextPos` is the end of the last
 * complete line read, so a record that is still being written is picked up by
 * the next call. A file shorter than the saved position (replaced or truncated)
 * is read again from the start.
 */
export function readCopilotUsage(path, startPos = 0) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return { calls: [], nextPos: startPos, size: 0 };
  }
  let from = Number.isInteger(startPos) && startPos >= 0 ? startPos : 0;
  if (from > size) from = 0;
  const want = Math.min(size - from, MAX_READ_BYTES);
  if (want <= 0) return { calls: [], nextPos: from, size };
  const buf = Buffer.alloc(want);
  const fd = openSync(path, "r");
  let got = 0;
  try {
    while (got < want) {
      const n = readSync(fd, buf, got, want - got, from + got);
      if (n <= 0) break;
      got += n;
    }
  } finally {
    closeSync(fd);
  }
  const chunk = buf.subarray(0, got);
  const { ranges, consumed } = splitLines(chunk);
  const calls = [];
  for (const [s, e] of ranges) {
    if (e - s > MAX_LINE_BYTES) continue;
    const line = chunk.subarray(s, e);
    if (!line.includes(USAGE_MARK)) continue;
    let rec;
    try {
      rec = JSON.parse(line.toString("utf8"));
    } catch {
      continue;
    }
    if (rec === null || typeof rec !== "object" || rec.type !== "session.usage_record") continue;
    const call = usageCall(rec, calls.length);
    if (call !== undefined) calls.push(call);
  }
  return { calls, nextPos: from + consumed, size };
}

/**
 * The per-model totals Copilot itself wrote at shutdown
 * (data.accountingSnapshot.modelMetrics[model].usage), or undefined when the
 * session has not shut down. Used by the tests to prove the reader's counts
 * equal the host's own; not used on the hook path.
 */
export function readCopilotShutdownTotals(path) {
  let text;
  try {
    const size = statSync(path).size;
    const buf = Buffer.alloc(Math.min(size, MAX_READ_BYTES));
    const fd = openSync(path, "r");
    try {
      readSync(fd, buf, 0, buf.length, 0);
    } finally {
      closeSync(fd);
    }
    const { ranges } = splitLines(buf);
    for (const [s, e] of ranges.reverse()) {
      if (e - s > MAX_LINE_BYTES) continue;
      const line = buf.subarray(s, e);
      if (!line.includes(SHUTDOWN_MARK)) continue;
      text = line.toString("utf8");
      break;
    }
  } catch {
    return undefined;
  }
  if (text === undefined) return undefined;
  let rec;
  try {
    rec = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (rec?.type !== "session.shutdown") return undefined;
  const metrics = rec.data?.accountingSnapshot?.modelMetrics;
  if (metrics === null || typeof metrics !== "object") return undefined;
  const out = {};
  for (const [model, m] of Object.entries(metrics)) {
    const u = m?.usage;
    if (u === null || typeof u !== "object") continue;
    out[model] = {
      inputTokens: count(u.inputTokens),
      outputTokens: count(u.outputTokens),
      cacheReadTokens: count(u.cacheReadTokens),
      cacheWriteTokens: count(u.cacheWriteTokens),
    };
  }
  return out;
}


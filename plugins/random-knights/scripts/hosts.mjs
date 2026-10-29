// Host session readers for the Random Knights AiEDs plugin.
//
// Claude Code's transcript is parsed in core.mjs. The readers under hosts/ read
// the other coding agents' session files into the SAME call shape, so one
// receipt path serves every host:
//
//   { id, model, provider, turn, count, turnId?, usage: {
//       input_tokens,                 plain (uncached) input
//       cache_creation_input_tokens,  input written to a cache
//       cache_read_input_tokens,      input served from a cache
//       output_tokens } }
//
// Only counters, model names and ids are read. A reader never copies prompt or
// response text into its result.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { TESTED_CODEX_VERSION, looksLikeCodex, parseCodexRollout } from "./hosts/codex.mjs";
import { TESTED_COPILOT_VERSION } from "./hosts/copilot.mjs";
import { TESTED_GROK_VERSION, looksLikeGrok, parseGrokSession } from "./hosts/grok.mjs";
import { jsonLines } from "./hosts/util.mjs";

export { parseCodexRollout, parseGrokSession };

/** The exact host versions the readers were checked against. */
export const TESTED_HOSTS = Object.freeze({
  codex: TESTED_CODEX_VERSION,
  grok: TESTED_GROK_VERSION,
  copilot: TESTED_COPILOT_VERSION,
});

const MAX_SNIFF_RECORDS = 1000000;

/**
 * Names the host that wrote a session file from its first records:
 * "codex", "grok", "claude" or "unknown". Content decides, not the hook's
 * name, because Grok deliberately sends Claude-shaped hook input.
 */
export function sniffFormat(text) {
  // Desktop transcripts open with many metadata lines, and the first
  // conversation record can start megabytes in or be a very large line, so the
  // whole text is read and the first user or assistant record decides. The
  // record bound only stops a pathological file from being walked forever.
  let seen = 0;
  for (const entry of jsonLines(text)) {
    if (seen++ >= MAX_SNIFF_RECORDS) break;
    if (looksLikeCodex(entry)) return "codex";
    if (looksLikeGrok(entry)) return "grok";
    if (
      (entry.type === "user" || entry.type === "assistant") &&
      entry.message !== null &&
      typeof entry.message === "object"
    ) {
      return "claude";
    }
  }
  return "unknown";
}

/**
 * Parses a session file from any supported host. `parseClaude` is passed in
 * because Claude Code's reader lives in core.mjs. An unrecognized file yields
 * no calls, so the caller prints nothing.
 */
export function parseSessionText(text, parseClaude) {
  switch (sniffFormat(text)) {
    case "grok":
      return parseGrokSession(text);
    case "codex":
      return parseCodexRollout(text);
    case "claude":
      return parseClaude(text);
    default:
      return { calls: [], lastTurn: 0, lastAssistantText: "", host: "unknown" };
  }
}

// -- Locating a session file by id --------------------------------------------

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Finds a Codex rollout or a Grok Build session file for a session id, without
 * ever joining an unvalidated id into a path. Codex names a rollout
 * `rollout-<timestamp>-<id>.jsonl` under sessions/YYYY/MM/DD; Grok keeps
 * `sessions/<encoded cwd>/<id>/updates.jsonl`. Returns the newest match, or
 * undefined.
 */
export function findHostSession(sessionId, env = process.env) {
  if (typeof sessionId !== "string" || !SAFE_ID.test(sessionId)) return undefined;
  let best;
  let bestMtime = -1;
  const consider = (path) => {
    try {
      const m = statSync(path).mtimeMs;
      if (m > bestMtime) {
        best = path;
        bestMtime = m;
      }
    } catch {
      // ignore unreadable candidates
    }
  };

  const codexHome =
    env.CODEX_HOME && env.CODEX_HOME.length > 0 ? env.CODEX_HOME : join(homedir(), ".codex");
  const walkDays = (dir, depth) => {
    for (const e of listDir(dir)) {
      const full = join(dir, e.name);
      if (e.isDirectory() && depth < 3) walkDays(full, depth + 1);
      else if (
        e.isFile() &&
        e.name.startsWith("rollout-") &&
        e.name.endsWith(`-${sessionId}.jsonl`)
      ) {
        consider(full);
      }
    }
  };
  walkDays(join(codexHome, "sessions"), 0);

  const grokHome =
    env.GROK_HOME && env.GROK_HOME.length > 0 ? env.GROK_HOME : join(homedir(), ".grok");
  for (const cwdDir of listDir(join(grokHome, "sessions"))) {
    if (!cwdDir.isDirectory()) continue;
    const candidate = join(grokHome, "sessions", cwdDir.name, sessionId, "updates.jsonl");
    if (existsSync(candidate)) consider(candidate);
  }
  return best;
}

/**
 * The newest Grok Build session file (updates.jsonl) under GROK_HOME, or under
 * ~/.grok. Grok keeps `sessions/<encoded cwd>/<session id>/updates.jsonl`.
 * "Newest" is the latest modification time. Returns undefined when there is
 * none. Used by `aieds receipt --last grok`.
 */
export function findNewestGrokSession(env = process.env) {
  const grokHome =
    env.GROK_HOME && env.GROK_HOME.length > 0 ? env.GROK_HOME : join(homedir(), ".grok");
  const root = join(grokHome, "sessions");
  let best;
  let bestMtime = -1;
  for (const cwdDir of listDir(root)) {
    if (!cwdDir.isDirectory()) continue;
    for (const sessionDir of listDir(join(root, cwdDir.name))) {
      if (!sessionDir.isDirectory()) continue;
      const candidate = join(root, cwdDir.name, sessionDir.name, "updates.jsonl");
      try {
        const m = statSync(candidate).mtimeMs;
        if (m > bestMtime) {
          best = candidate;
          bestMtime = m;
        }
      } catch {
        // no updates.jsonl in this folder
      }
    }
  }
  return best;
}

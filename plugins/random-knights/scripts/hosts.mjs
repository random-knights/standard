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

import { TESTED_GROK_VERSION, looksLikeGrok, parseGrokSession } from "./hosts/grok.mjs";
import { jsonLines } from "./hosts/util.mjs";

export { parseGrokSession };

/** The exact host versions the readers were checked against. */
export const TESTED_HOSTS = Object.freeze({
  grok: TESTED_GROK_VERSION,
});

/**
 * Names the host that wrote a session file from its first records:
 * "grok", "claude" or "unknown". Content decides, not the hook's
 * name, because Grok deliberately sends Claude-shaped hook input.
 */
export function sniffFormat(text) {
  let seen = 0;
  for (const entry of jsonLines(String(text).slice(0, 200000))) {
    if (seen++ > 60) break;
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
 * Finds a Grok Build session file for a session id, without ever joining an
 * unvalidated id into a path. Grok keeps
 * `sessions/<encoded cwd>/<id>/updates.jsonl` under its home directory.
 * Returns the newest match, or undefined.
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

  const grokHome =
    env.GROK_HOME && env.GROK_HOME.length > 0 ? env.GROK_HOME : join(homedir(), ".grok");
  for (const cwdDir of listDir(join(grokHome, "sessions"))) {
    if (!cwdDir.isDirectory()) continue;
    const candidate = join(grokHome, "sessions", cwdDir.name, sessionId, "updates.jsonl");
    if (existsSync(candidate)) consider(candidate);
  }
  return best;
}

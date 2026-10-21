// Local files of the optional receipts sync: the per-device token file, the
// queue of receipts not yet sent, a small state file, and the Copilot CLI read
// marks. Everything lives in ONE directory, the user config dir:
//
//   Windows        %APPDATA%\random-knights
//   macOS, Linux   $XDG_CONFIG_HOME/random-knights, or ~/.config/random-knights
//
// AIEDS_CONFIG_DIR names the directory itself (tests, and people who want it
// elsewhere). Nothing here is created until the user runs `aieds connect` (or,
// for the Copilot CLI marks, until the first Copilot receipt), and no file
// ever holds prompt or response text: numbers, model names and random ids only.
//
// The token file is written with mode 0600 on POSIX. Windows has no chmod: the
// file sits in the per-user profile folder (%APPDATA%), whose default ACL
// already limits it to the user, SYSTEM and administrators. The token is never
// printed, logged or put in the queue.

import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_QUEUE_MAX = 2000;
const HARD_QUEUE_MAX = 20000;
const SYNC_FILE = "sync.json";
const QUEUE_FILE = "sync-queue.jsonl";
const STATE_FILE = "sync-state.json";
const LOCK_FILE = "sync.lock";
const MARKS_FILE = "copilot-marks.json";
const CONTRIBUTE_FILE = "contribute.json";
const CONTRIBUTE_QUEUE_FILE = "contribute-queue.jsonl";
const CONTRIBUTE_STATE_FILE = "contribute-state.json";
const CONTRIBUTE_LOCK_FILE = "contribute.lock";
const LOCK_STALE_MS = 60_000;

/** The user config directory for this tool (not created here). */
export function configDir(env = process.env, platform = process.platform) {
  const explicit = env.AIEDS_CONFIG_DIR;
  if (typeof explicit === "string" && explicit.trim().length > 0) return explicit.trim();
  if (platform === "win32") {
    const appData =
      typeof env.APPDATA === "string" && env.APPDATA.length > 0
        ? env.APPDATA
        : join(env.USERPROFILE || homedir(), "AppData", "Roaming");
    return join(appData, "random-knights");
  }
  const xdg =
    typeof env.XDG_CONFIG_HOME === "string" && env.XDG_CONFIG_HOME.length > 0
      ? env.XDG_CONFIG_HOME
      : join(homedir(), ".config");
  return join(xdg, "random-knights");
}

export function paths(env = process.env) {
  const dir = configDir(env);
  return {
    dir,
    sync: join(dir, SYNC_FILE),
    queue: join(dir, QUEUE_FILE),
    state: join(dir, STATE_FILE),
    lock: join(dir, LOCK_FILE),
    marks: join(dir, MARKS_FILE),
    // The community contribution files (contribute.mjs). Separate from sync.
    contribute: join(dir, CONTRIBUTE_FILE),
    contributeQueue: join(dir, CONTRIBUTE_QUEUE_FILE),
    contributeState: join(dir, CONTRIBUTE_STATE_FILE),
    contributeLock: join(dir, CONTRIBUTE_LOCK_FILE),
  };
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/** Writes through a temp file and a rename, so a reader never sees half a file. */
export function writeAtomic(file, text, mode) {
  ensureDir(join(file, ".."));
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode });
  try {
    chmodSync(tmp, mode);
  } catch {
    // Windows has no POSIX modes; the profile ACL applies.
  }
  renameSync(tmp, file);
}

export function readJson(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed !== null && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// -- Connection ------------------------------------------------------------------

/** The connection, or undefined when this device has not been connected. */
export function loadConnection(env = process.env) {
  const c = readJson(paths(env).sync);
  if (
    c === undefined ||
    typeof c.token !== "string" ||
    !c.token.startsWith("rkd_") ||
    typeof c.endpoint !== "string" ||
    c.endpoint.length === 0
  ) {
    return undefined;
  }
  const queueMax =
    Number.isInteger(c.queueMax) && c.queueMax > 0
      ? Math.min(c.queueMax, HARD_QUEUE_MAX)
      : DEFAULT_QUEUE_MAX;
  return {
    endpoint: c.endpoint,
    token: c.token,
    deviceId: typeof c.deviceId === "string" ? c.deviceId : "",
    connectedAt: typeof c.connectedAt === "string" ? c.connectedAt : "",
    queueMax,
  };
}

export function saveConnection(conn, env = process.env) {
  writeAtomic(
    paths(env).sync,
    JSON.stringify(
      {
        endpoint: conn.endpoint,
        token: conn.token,
        deviceId: conn.deviceId,
        connectedAt: conn.connectedAt,
        queueMax: conn.queueMax ?? DEFAULT_QUEUE_MAX,
      },
      null,
      2,
    ) + "\n",
    0o600,
  );
}

/** Deletes the token file, the queue and the state. Returns what existed. */
export function clearConnection(env = process.env) {
  const p = paths(env);
  const had = existsSync(p.sync);
  for (const f of [p.sync, p.queue, p.state, p.lock]) {
    try {
      rmSync(f, { force: true });
    } catch {
      // Best effort; a locked file is removed by the next run.
    }
  }
  return had;
}

/** True when sync is switched off for this process. */
export function syncDisabled(env = process.env) {
  const v = String(env.AIEDS_SYNC ?? "").trim().toLowerCase();
  return ["off", "0", "false", "no", "disabled"].includes(v);
}

// -- State -----------------------------------------------------------------------

const EMPTY_STATE = Object.freeze({
  failures: 0,
  nextAttemptAtMs: 0,
  dropped: 0,
  rejected: 0,
  sent: 0,
  duplicates: 0,
  lastSentAtMs: 0,
  lastError: "",
  notice: "",
});

export function loadState(env = process.env) {
  const s = readJson(paths(env).state) ?? {};
  const out = { ...EMPTY_STATE };
  for (const k of Object.keys(EMPTY_STATE)) {
    if (typeof EMPTY_STATE[k] === "number" && Number.isFinite(s[k])) out[k] = s[k];
    if (typeof EMPTY_STATE[k] === "string" && typeof s[k] === "string") out[k] = s[k].slice(0, 80);
  }
  return out;
}

export function saveState(state, env = process.env) {
  writeAtomic(paths(env).state, JSON.stringify(state) + "\n", 0o600);
}

// -- Queue -----------------------------------------------------------------------

/** Queue lines: { host, receipt }. A torn or foreign line is skipped, never fatal. */
export function readQueue(env = process.env) {
  let text;
  try {
    text = readFileSync(paths(env).queue, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    try {
      const e = JSON.parse(line);
      if (
        e !== null &&
        typeof e === "object" &&
        typeof e.host === "string" &&
        e.receipt !== null &&
        typeof e.receipt === "object" &&
        typeof e.receipt.rid === "string"
      ) {
        out.push({ host: e.host, receipt: e.receipt });
      }
    } catch {
      // skip
    }
  }
  return out;
}

function writeQueue(entries, env) {
  const text = entries.map((e) => JSON.stringify(e)).join("\n");
  writeAtomic(paths(env).queue, text.length > 0 ? `${text}\n` : "", 0o600);
}

/**
 * Appends receipts to the queue and keeps it bounded: past queueMax the OLDEST
 * entries are dropped and counted. Entries whose rid is already queued are
 * skipped, so a re-run never queues a response twice.
 */
export function enqueue(entries, conn, env = process.env) {
  if (entries.length === 0) return { queued: 0, dropped: 0 };
  const p = paths(env);
  ensureDir(p.dir);
  const existing = readQueue(env);
  const known = new Set(existing.map((e) => e.receipt.rid));
  const fresh = entries.filter((e) => !known.has(e.receipt.rid));
  if (fresh.length === 0) return { queued: 0, dropped: 0 };
  const max = conn?.queueMax ?? DEFAULT_QUEUE_MAX;
  if (existing.length + fresh.length <= max) {
    appendFileSync(p.queue, fresh.map((e) => JSON.stringify(e) + "\n").join(""), { mode: 0o600 });
    return { queued: fresh.length, dropped: 0 };
  }
  const all = [...existing, ...fresh];
  const dropped = all.length - max;
  writeQueue(all.slice(dropped), env);
  const st = loadState(env);
  st.dropped += dropped;
  saveState(st, env);
  return { queued: fresh.length, dropped };
}

/** Removes the entries whose rid is in `rids` (rewrites from the file as it is NOW). */
export function removeFromQueue(rids, env = process.env) {
  if (rids.size === 0) return;
  const rest = readQueue(env).filter((e) => !rids.has(e.receipt.rid));
  writeQueue(rest, env);
}

// -- Lock (one flusher at a time) --------------------------------------------------

/** Takes the flush lock, or returns undefined if another flusher holds it. */
export function takeLock(env = process.env, nowMs = Date.now(), lockFile = undefined) {
  const p = paths(env);
  if (lockFile !== undefined) p.lock = lockFile;
  ensureDir(p.dir);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(p.lock, "wx", 0o600);
      closeSync(fd);
      return () => {
        try {
          rmSync(p.lock, { force: true });
        } catch {
          // ignore
        }
      };
    } catch {
      try {
        if (nowMs - statSync(p.lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(p.lock, { force: true });
          continue;
        }
      } catch {
        // the holder just released it
      }
      return undefined;
    }
  }
  return undefined;
}

// -- Copilot marks ---------------------------------------------------------------

const MAX_MARK_ENTRIES = 200;

/** Byte marks already processed per Copilot session (keys are hashes, not ids). */
export function loadMarks(env = process.env) {
  const o = readJson(paths(env).marks) ?? {};
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (/^[0-9a-f]{16,64}$/.test(k) && v !== null && typeof v === "object" && Number.isInteger(v.pos)) {
      out[k] = { pos: Math.max(0, v.pos), seenAtMs: Number.isFinite(v.seenAtMs) ? v.seenAtMs : 0 };
    }
  }
  return out;
}

export function saveMarks(marks, env = process.env) {
  const entries = Object.entries(marks).sort((a, b) => b[1].seenAtMs - a[1].seenAtMs);
  writeAtomic(
    paths(env).marks,
    JSON.stringify(Object.fromEntries(entries.slice(0, MAX_MARK_ENTRIES))) + "\n",
    0o600,
  );
}

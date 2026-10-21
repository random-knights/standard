// The receipts sync client: the device-code sign-in calls, and the flusher that
// sends the local queue to syncReceipts (SYNC-SPEC sections 3 to 5).
//
// Rules this file keeps, each covered by a test against a fake server:
//   - With no token file there is NO network call at all.
//   - AIEDS_SYNC=off turns every send off for the process.
//   - It never waits longer than the budget it is given (a hook passes a few
//     seconds), never throws into its caller, and never prints.
//   - The token goes in one header and nowhere else: not in the queue, not in
//     an error message, not in a log, not in argv or a child process.
//   - It retries only what can succeed later (429, 5xx, no network, 426, and
//     the rate-limit rejections of a 200). A 4xx that says "this payload is
//     wrong" drops that batch and counts it: retrying would never help.

import {
  clearConnection,
  loadConnection,
  loadState,
  readQueue,
  removeFromQueue,
  saveState,
  syncDisabled,
  takeLock,
} from "./store.mjs";
import { MAX_RECEIPTS_PER_BATCH, batchBody } from "./receipts.mjs";

export const CLIENT_NAME = "aieds-cli";
/** Keep equal to plugins/random-knights/package.json (a test checks). */
export const CLIENT_VERSION = "0.4.0";
/** The shared functions project (production). Staging is randomknights-abc. */
export const DEFAULT_ENDPOINT = "https://us-central1-randomknights-xyz.cloudfunctions.net";

const MIN_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
const RETRY_LATER_REASONS = new Set(["rate_limited", "rollup_full"]);

/** https, or http only to this machine (tests, a local emulator). */
export function endpointProblem(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return "The endpoint is not a URL.";
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && loopback) return null;
  return "The endpoint must be https (http is allowed only to this computer).";
}

export function functionUrl(endpoint, name) {
  return `${endpoint.replace(/\/+$/, "")}/${name}`;
}

/** POST JSON (an object, or an already-serialized string so a preview can be byte-equal). Returns { status, body }; status 0 means no answer. Never throws, never echoes the token. */
export async function postJson(url, body, { token, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (typeof token === "string") headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(100, timeoutMs)),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    return { status: res.status, body: json !== null && typeof json === "object" ? json : {} };
  } catch {
    return { status: 0, body: {} };
  }
}

// -- Device-code sign-in -------------------------------------------------------------

export async function startDevice({ endpoint, label, fetchImpl }) {
  return postJson(
    functionUrl(endpoint, "syncDeviceStart"),
    { client: CLIENT_NAME, clientVersion: CLIENT_VERSION, deviceLabel: label },
    { fetchImpl },
  );
}

export async function pollDevice({ endpoint, deviceCode, fetchImpl }) {
  return postJson(functionUrl(endpoint, "syncDevicePoll"), { deviceCode }, { fetchImpl });
}

/** Tells the server to revoke THIS device's token (the CLI's own disconnect). */
export async function revokeSelf({ endpoint, token, fetchImpl }) {
  return postJson(functionUrl(endpoint, "syncReceipts"), { op: "revoke" }, { token, fetchImpl });
}

// -- Flushing the queue --------------------------------------------------------------

export function backoffMs(failures, retryAfterSec) {
  const exp = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** Math.max(0, failures - 1));
  const hinted = Number.isFinite(retryAfterSec)
    ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, retryAfterSec) * 1000)
    : 0;
  return Math.max(exp, hinted);
}

/**
 * Sends what is queued. Returns a summary object and never throws:
 *   { state, sent, duplicates, rejected, dropped, kept, error? }
 * `state` is one of not-connected, off, backoff, empty, busy, done, retry,
 * revoked, blocked.
 */
export async function flushQueue({
  env = process.env,
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
  budgetMs = 2500,
  force = false,
} = {}) {
  const summary = { state: "done", sent: 0, duplicates: 0, rejected: 0, dropped: 0, kept: 0 };
  let release;
  try {
    if (syncDisabled(env)) return { ...summary, state: "off" };
    const conn = loadConnection(env);
    if (conn === undefined) return { ...summary, state: "not-connected" };
    const bad = endpointProblem(conn.endpoint);
    if (bad !== null) return { ...summary, state: "blocked", error: "endpoint" };

    const state = loadState(env);
    if (!force && nowMs < state.nextAttemptAtMs) {
      return { ...summary, state: "backoff", kept: readQueue(env).length };
    }
    if (readQueue(env).length === 0) return { ...summary, state: "empty" };

    release = takeLock(env, nowMs);
    if (release === undefined) return { ...summary, state: "busy", kept: readQueue(env).length };

    const deadline = Date.now() + budgetMs;
    const url = functionUrl(conn.endpoint, "syncReceipts");

    for (;;) {
      const queue = readQueue(env);
      if (queue.length === 0) break;
      const remaining = deadline - Date.now();
      if (remaining < 250) {
        summary.state = "retry";
        break;
      }
      const host = queue[0].host;
      const batch = queue.filter((e) => e.host === host).slice(0, MAX_RECEIPTS_PER_BATCH);
      const body = batchBody(host, batch.map((e) => e.receipt), {
        name: CLIENT_NAME,
        version: CLIENT_VERSION,
      });
      const res = await postJson(url, body, { token: conn.token, fetchImpl, timeoutMs: remaining });
      const rids = new Set(batch.map((e) => e.receipt.rid));

      if (res.status === 200) {
        const b = res.body;
        const rejected = Array.isArray(b.rejected) ? b.rejected : [];
        const retryRids = new Set();
        let permanent = 0;
        for (const r of rejected) {
          if (r && typeof r.reason === "string" && RETRY_LATER_REASONS.has(r.reason)) {
            if (typeof r.rid === "string") retryRids.add(r.rid);
          } else {
            permanent += 1;
          }
        }
        for (const rid of retryRids) rids.delete(rid);
        removeFromQueue(rids, env);
        state.sent += Number.isInteger(b.accepted) ? b.accepted : 0;
        state.duplicates += Number.isInteger(b.duplicates) ? b.duplicates : 0;
        state.rejected += permanent;
        state.failures = 0;
        state.lastSentAtMs = Date.now();
        state.lastError = permanent > 0 ? "some_rejected" : "";
        summary.sent += Number.isInteger(b.accepted) ? b.accepted : 0;
        summary.duplicates += Number.isInteger(b.duplicates) ? b.duplicates : 0;
        summary.rejected += permanent;
        if (typeof b.currentModelVersion === "string") state.notice = "update_needed";
        if (retryRids.size > 0 || b.rateLimited === true) {
          state.nextAttemptAtMs = Date.now() + backoffMs(1, Number(b.retryAfterSec));
          summary.state = "retry";
          saveState(state, env);
          break;
        }
        state.nextAttemptAtMs = 0;
        saveState(state, env);
        continue;
      }

      if (res.status === 401) {
        // Revoked or unknown token: this device is no longer connected.
        clearConnection(env);
        const fresh = loadState(env);
        fresh.notice = "disconnected_by_server";
        fresh.lastError = typeof res.body.error === "string" ? res.body.error.slice(0, 40) : "token_invalid";
        saveState(fresh, env);
        return { ...summary, state: "revoked", error: fresh.lastError };
      }

      const code = typeof res.body.error === "string" ? res.body.error.slice(0, 40) : "";
      state.lastError = res.status === 0 ? "network" : code || `http_${res.status}`;

      if (res.status === 429 || res.status === 426 || res.status === 0 || res.status >= 500) {
        state.failures += 1;
        state.nextAttemptAtMs = Date.now() + backoffMs(state.failures, Number(res.body.retryAfterSec));
        if (res.status === 426) state.notice = "update_needed";
        saveState(state, env);
        summary.state = "retry";
        summary.error = state.lastError;
        break;
      }

      // Any other 4xx says the payload itself is wrong. Drop it and count it.
      removeFromQueue(rids, env);
      state.dropped += rids.size;
      summary.dropped += rids.size;
      saveState(state, env);
      summary.error = state.lastError;
    }
    summary.kept = readQueue(env).length;
    return summary;
  } catch {
    return { ...summary, state: "retry", error: "internal", kept: 0 };
  } finally {
    if (release) release();
  }
}

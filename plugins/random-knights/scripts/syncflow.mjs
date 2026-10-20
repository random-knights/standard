// The glue between a receipt and the sync queue. Used by the hook, the
// wrappers and the on-demand receipt. Everything here is a no-op unless this
// device was connected with `aieds connect` and sync is not switched off, and
// nothing here ever throws into the caller.

import { randomUUID } from "node:crypto";

import { loadConnection, enqueue, syncDisabled } from "./store.mjs";
import { flushQueue } from "./syncclient.mjs";
import { receiptProblem, receiptsFromCalls } from "./receipts.mjs";

/** True when receipts should be queued: connected, and not switched off. */
export function syncActive(env = process.env) {
  return !syncDisabled(env) && loadConnection(env) !== undefined;
}

/**
 * Validates `entries` ({host, receipt}) against the allowlist, queues the good
 * ones and tries one flush within `budgetMs`. A receipt that fails the local
 * check is dropped here (and counted in the result), never sent.
 */
export async function queueAndFlush(entries, { env = process.env, fetchImpl, budgetMs = 2500, nowMs = Date.now() } = {}) {
  const result = { queued: 0, invalid: 0, dropped: 0, flush: undefined };
  try {
    if (!syncActive(env) || entries.length === 0) return result;
    const conn = loadConnection(env);
    const good = [];
    for (const e of entries) {
      if (receiptProblem(e.receipt, nowMs) === null) good.push(e);
      else result.invalid += 1;
    }
    const q = enqueue(good, conn, env);
    result.queued = q.queued;
    result.dropped = q.dropped;
    result.flush = await flushQueue({ env, fetchImpl, budgetMs, nowMs: Date.now() });
  } catch {
    // Sync is a convenience. It never breaks the host.
  }
  return result;
}

/** One response from a wrapper (Ollama, a chat completion, `usage`): numbers only. */
export function wrapperEntries({ host, call, nowMs = Date.now() }) {
  return receiptsFromCalls([call], {
    host,
    sessionId: randomUUID(),
    turnKey: randomUUID(),
    tsMs: nowMs,
  });
}

// Community contribution, the non-interactive half (CONTRIBUTE-SPEC sections 2,
// 3 and 4): the token file, the local queue, the daily buckets, and the sender.
// The commands that talk to the person live in contribute.mjs; the hook uses
// only this file.
//
// Rules this file keeps, each covered by a test:
//   - It is OFF unless `aieds contribute on` stored contribute.json. With no
//     such file there is NO network call and NO file is written.
//   - AIEDS_CONTRIBUTE=off blocks every network call of this file.
//   - What leaves the machine is the BUCKET_FIELDS allowlist, built field by
//     field from the queue. A bucket is one (UTC day, provider, model, tool,
//     token source). No time of day, no session id, no path, no prompt.
//   - The body `preview` prints is the same string `submit` posts.
//   - The token goes in one header and nowhere else: not in the queue, a
//     message, a log, argv or a child process.
//   - It sends only days that have closed (UTC), at most seven days old, and
//     retries at most twice with a backoff. A hook never retries.
//   - The token is minted by, and is only ever sent back to, the endpoint that
//     was chosen when contributing was turned on.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkValue, CLIENT_HOSTS, RECEIPT_FIELDS, receiptProblem } from "./receipts.mjs";
import {
  CLIENT_VERSION,
  CLIENT_NAME,
  backoffMs,
  endpointProblem,
  functionUrl,
  postJson,
} from "./syncclient.mjs";
import { ensureDir, paths, readJson, takeLock, writeAtomic } from "./store.mjs";

/** The consent version this client knows. The service stamps it; a bump revokes older consents. */
export const CONSENT_VERSION = 1;
/** sha-256 of consent-contribute.txt. A text change must change this AND bump CONSENT_VERSION. */
export const CONSENT_TEXT_SHA256 = "211a454a8ed56f1fd4a664bdd58f6b5cc8da7b9aeff809c052f5585295091f32";

export const PRODUCTION_ENDPOINT = "https://us-central1-randomknights-xyz.cloudfunctions.net";
export const STAGING_ENDPOINT = "https://us-central1-randomknights-abc.cloudfunctions.net";

export const COMMUNITY_SCHEMA = "rk-community/1";
export const MAX_BUCKETS_PER_REQUEST = 50;
/** The service accepts a day up to this many days after it. */
export const MAX_DAY_AGE_DAYS = 7;
export const DEFAULT_CQUEUE_MAX = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CAP_RESPONSES_PER_DAY = 5000;
const CAP_TOKENS_PER_DAY = 50_000_000;
/** Rejections that can succeed later: keep those summaries queued. */
const RETRY_LATER_REASONS = new Set(["ledger_full", "rate_limited", "model_version"]);

const here = dirname(fileURLToPath(import.meta.url));

// -- Consent text -------------------------------------------------------------------

/**
 * The approved consent text, byte for byte. It lives in the plugin root
 * (consent-contribute.txt); the npm package stages a copy next to this file.
 * Throws if the file is missing or is not the text this client version pins.
 */
export function consentText() {
  let text;
  for (const p of [join(here, "..", "consent-contribute.txt"), join(here, "consent-contribute.txt")]) {
    try {
      text = readFileSync(p, "utf8");
      break;
    } catch {
      // try the next place
    }
  }
  if (text === undefined) throw new Error("The consent text file is missing from this install.");
  if (createHash("sha256").update(text).digest("hex") !== CONSENT_TEXT_SHA256) {
    throw new Error("The consent text does not match this version of the tool.");
  }
  return text;
}

// -- Switches and endpoint -----------------------------------------------------------

/** True when contributing is switched off for this process. */
export function contributeDisabled(env = process.env) {
  const v = String(env.AIEDS_CONTRIBUTE ?? "").trim().toLowerCase();
  return ["off", "0", "false", "no", "disabled"].includes(v);
}

function truthy(v) {
  return ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());
}

/** The endpoint to mint a token at: AIEDS_COMMUNITY_URL, else staging when asked, else production. */
export function chooseEndpoint(args, env = process.env) {
  const url = String(env.AIEDS_COMMUNITY_URL ?? "").trim();
  if (url.length > 0) return url.replace(/\/+$/, "");
  if (args.includes("--staging") || truthy(env.AIEDS_COMMUNITY_STAGING)) return STAGING_ENDPOINT;
  return PRODUCTION_ENDPOINT;
}

export function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// -- The token file ------------------------------------------------------------------

/**
 * The contribution record, or undefined when contributing was never turned on.
 * `enabled: false` with `withdrawPending: true` is the offline `off`: sending is
 * already stopped, and the token is kept ONLY so the service can be told later.
 */
export function loadContribute(env = process.env) {
  const c = readJson(paths(env).contribute);
  if (
    c === undefined ||
    typeof c.token !== "string" ||
    !c.token.startsWith("rkc_") ||
    typeof c.endpoint !== "string" ||
    c.endpoint.length === 0
  ) {
    return undefined;
  }
  return {
    endpoint: c.endpoint,
    token: c.token,
    enabled: c.enabled !== false,
    consentVersion: Number.isInteger(c.consentVersion) ? c.consentVersion : 0,
    consentAt: typeof c.consentAt === "string" ? c.consentAt : "",
    withdrawPending: c.withdrawPending === true,
  };
}

export function saveContribute(conn, env = process.env) {
  writeAtomic(
    paths(env).contribute,
    JSON.stringify(
      {
        endpoint: conn.endpoint,
        token: conn.token,
        enabled: conn.enabled !== false,
        consentVersion: conn.consentVersion,
        consentAt: conn.consentAt,
        withdrawPending: conn.withdrawPending === true,
      },
      null,
      2,
    ) + "\n",
    0o600,
  );
}

/** Deletes the token file, the queue and the state. Returns whether a token file existed. */
export function clearContribute(env = process.env) {
  const p = paths(env);
  const had = existsSync(p.contribute);
  for (const f of [p.contribute, p.contributeQueue, p.contributeState, p.contributeLock]) {
    try {
      rmSync(f, { force: true });
    } catch {
      // Best effort; a locked file is removed by the next run.
    }
  }
  return had;
}

/** Deletes only the queue (the summaries not yet sent). */
export function clearContributeQueue(env = process.env) {
  try {
    rmSync(paths(env).contributeQueue, { force: true });
  } catch {
    // ignore
  }
}

/** True when summaries should be queued and sent: turned on, and not switched off. */
export function contributeActive(env = process.env) {
  return !contributeDisabled(env) && loadContribute(env)?.enabled === true;
}

// -- State (numbers and dates only) -----------------------------------------------------

const EMPTY_CSTATE = Object.freeze({
  lastAttemptDay: "",
  lastSentDay: "",
  lastSentBuckets: 0,
  lastSentResponses: 0,
  lastSentTokensIn: 0,
  lastSentTokensOut: 0,
  dropped: 0,
  expired: 0,
  lastError: "",
});

export function loadCState(env = process.env) {
  const s = readJson(paths(env).contributeState) ?? {};
  const out = { ...EMPTY_CSTATE };
  for (const k of Object.keys(EMPTY_CSTATE)) {
    if (typeof EMPTY_CSTATE[k] === "number" && Number.isFinite(s[k])) out[k] = s[k];
    if (typeof EMPTY_CSTATE[k] === "string" && typeof s[k] === "string") out[k] = s[k].slice(0, 80);
  }
  return out;
}

export function saveCState(state, env = process.env) {
  writeAtomic(paths(env).contributeState, JSON.stringify(state) + "\n", 0o600);
}

// -- The bucket allowlist (CONTRIBUTE-SPEC 2.1), a copy of the service's table ---------------

const P = RECEIPT_FIELDS;
/** The only keys a bucket may carry, in the order they are written. */
export const BUCKET_FIELDS = Object.freeze({
  schema: { kind: "const", value: COMMUNITY_SCHEMA, required: true },
  day: { kind: "day", required: true },
  provider: { ...P.provider, required: true },
  model: { ...P.model, required: true },
  host: { kind: "enum", values: CLIENT_HOSTS, required: true },
  tokenSource: { kind: "enum", values: ["reported", "estimated"], required: true },
  responses: { kind: "int", min: 1, max: CAP_RESPONSES_PER_DAY, required: true },
  tokensIn: { kind: "int", min: 0, max: CAP_TOKENS_PER_DAY, required: true },
  tokensOut: { kind: "int", min: 0, max: CAP_TOKENS_PER_DAY, required: true },
  cacheReadTokens: { kind: "int", min: 0, max: CAP_TOKENS_PER_DAY, required: false },
  cacheWriteTokens: { kind: "int", min: 0, max: CAP_TOKENS_PER_DAY, required: false },
  aiedsModelVersion: { ...P.aiedsModelVersion, required: true },
  aiedsVersion: { ...P.aiedsVersion, required: false },
  energyWh: { kind: "num", min: 0, max: 1e7, required: true },
  carbonG: { kind: "num", min: 0, max: 1e7, required: true },
  waterL: { kind: "num", min: 0, max: 1e7, required: true },
  treeTimeMin: { kind: "num", min: 0, max: 1e10, required: true },
});
export const BUCKET_FIELD_NAMES = Object.freeze(Object.keys(BUCKET_FIELDS));

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(s) {
  if (typeof s !== "string" || !DAY_RE.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(ms) && utcDay(ms) === s;
}

/** Checks one bucket the way the service will. Null when it passes, else a reason naming the FIELD. */
export function bucketProblem(b) {
  if (b === null || typeof b !== "object" || Array.isArray(b)) return "not_an_object";
  for (const key of Object.keys(b)) {
    if (!BUCKET_FIELD_NAMES.includes(key)) return `unknown_field:${/^[A-Za-z0-9_.-]{1,40}$/.test(key) ? key : "(invalid name)"}`;
  }
  for (const [name, rule] of Object.entries(BUCKET_FIELDS)) {
    const present = Object.prototype.hasOwnProperty.call(b, name) && b[name] !== undefined;
    if (!present) {
      if (rule.required) return `missing_${name}`;
      continue;
    }
    const ok =
      rule.kind === "const" ? b[name] === rule.value : rule.kind === "day" ? isRealDay(b[name]) : checkValue(rule, b[name]);
    if (!ok) return `invalid_${name}`;
  }
  for (const f of ["cacheReadTokens", "cacheWriteTokens"]) {
    if (typeof b[f] === "number" && b[f] > b.tokensIn) return `invalid_${f}`;
  }
  if (b.tokensIn + b.tokensOut <= 0) return "implausible_tokens";
  return null;
}

// -- The local queue --------------------------------------------------------------------

/** What the queue keeps of a response: numbers, names and the UTC DAY. No time of day, no session. */
const QUEUE_NUMBER_FIELDS = [
  "tokensIn", "tokensOut", "cacheReadTokens", "cacheWriteTokens",
  "energyWh", "carbonG", "waterMl", "treeTimeMin",
];

function toQueueEntry(host, r) {
  const e = {
    rid: r.rid,
    day: String(r.tsUtc).slice(0, 10),
    host: CLIENT_HOSTS.includes(host) ? host : "other",
    provider: r.provider,
    model: r.model,
    tokenSource: r.tokenSource,
    aiedsModelVersion: r.aiedsModelVersion,
  };
  if (typeof r.aiedsVersion === "string") e.aiedsVersion = r.aiedsVersion;
  for (const f of QUEUE_NUMBER_FIELDS) e[f] = typeof r[f] === "number" ? r[f] : 0;
  return e;
}

function validQueueEntry(e) {
  return (
    e !== null &&
    typeof e === "object" &&
    typeof e.rid === "string" &&
    /^[0-9a-f]{32}$/.test(e.rid) &&
    isRealDay(e.day) &&
    CLIENT_HOSTS.includes(e.host) &&
    checkValue(P.provider, e.provider) &&
    checkValue(P.model, e.model) &&
    (e.tokenSource === "reported" || e.tokenSource === "estimated") &&
    checkValue(P.aiedsModelVersion, e.aiedsModelVersion) &&
    QUEUE_NUMBER_FIELDS.every((f) => Number.isFinite(e[f]) && e[f] >= 0)
  );
}

/** Queue lines. A torn or foreign line is skipped, never fatal; unknown keys are dropped on read. */
export function readCQueue(env = process.env) {
  let text;
  try {
    text = readFileSync(paths(env).contributeQueue, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    try {
      const e = JSON.parse(line);
      if (validQueueEntry(e)) {
        const clean = {
          rid: e.rid, day: e.day, host: e.host, provider: e.provider, model: e.model,
          tokenSource: e.tokenSource, aiedsModelVersion: e.aiedsModelVersion,
        };
        if (typeof e.aiedsVersion === "string" && checkValue(P.aiedsVersion, e.aiedsVersion)) clean.aiedsVersion = e.aiedsVersion;
        for (const f of QUEUE_NUMBER_FIELDS) clean[f] = e[f];
        out.push(clean);
      }
    } catch {
      // skip
    }
  }
  return out;
}

function writeCQueue(entries, env) {
  const text = entries.map((e) => JSON.stringify(e)).join("\n");
  writeAtomic(paths(env).contributeQueue, text.length > 0 ? `${text}\n` : "", 0o600);
}

/**
 * Adds responses ({host, receipt}, the sync entry shape) to the queue. Each
 * receipt must pass the same local check the sync client applies. Bounded: past
 * `max` the OLDEST entries are dropped. A rid already queued is skipped.
 * Does nothing unless contributing is on.
 */
export function queueEntries(entries, { env = process.env, nowMs = Date.now(), max = DEFAULT_CQUEUE_MAX } = {}) {
  const result = { queued: 0, invalid: 0, dropped: 0 };
  if (!contributeActive(env) || entries.length === 0) return result;
  const existing = readCQueue(env);
  const known = new Set(existing.map((e) => e.rid));
  const fresh = [];
  for (const e of entries) {
    if (receiptProblem(e.receipt, nowMs) !== null) {
      result.invalid += 1;
      continue;
    }
    if (known.has(e.receipt.rid)) continue;
    known.add(e.receipt.rid);
    fresh.push(toQueueEntry(e.host, e.receipt));
  }
  if (fresh.length === 0) return result;
  ensureDir(paths(env).dir);
  result.queued = fresh.length;
  if (existing.length + fresh.length <= max) {
    appendFileSync(paths(env).contributeQueue, fresh.map((e) => JSON.stringify(e) + "\n").join(""), { mode: 0o600 });
    return result;
  }
  const all = [...existing, ...fresh];
  result.dropped = all.length - max;
  writeCQueue(all.slice(result.dropped), env);
  const st = loadCState(env);
  st.dropped += result.dropped;
  saveCState(st, env);
  return result;
}

function removeRids(rids, env) {
  if (rids.size === 0) return;
  writeCQueue(readCQueue(env).filter((e) => !rids.has(e.rid)), env);
}

// -- Daily buckets -------------------------------------------------------------------------

function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function dayAge(day, todayDay) {
  return Math.round((Date.parse(`${todayDay}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);
}

/**
 * Turns queue entries into the uploads. One bucket per (day, provider, model,
 * host, tokenSource), summed. Only CLOSED days (before today, UTC) and at most
 * seven days old are built; `includeToday` and `maxAgeDays` are for `preview`
 * of a transcript, which is only a look and is never sent.
 *
 * Returns { batches, open, expiredRids, invalidRids, withheld }, where each
 * batch is { body (the exact string to POST), buckets, ridGroups } and
 * ridGroups[i] lists the queue ids behind buckets[i].
 */
export function buildUploads(entries, { nowMs = Date.now(), includeToday = false, maxAgeDays = MAX_DAY_AGE_DAYS } = {}) {
  const today = utcDay(nowMs);
  const groups = new Map();
  let open = 0;
  const expiredRids = new Set();
  for (const e of entries) {
    const age = dayAge(e.day, today);
    if (age <= 0 && !includeToday) {
      open += 1;
      continue;
    }
    if (age < 0) {
      open += 1;
      continue;
    }
    if (age > maxAgeDays) {
      expiredRids.add(e.rid);
      continue;
    }
    const key = [e.day, e.provider, e.model, e.host, e.tokenSource].join("\u0000");
    const g = groups.get(key) ?? [];
    g.push(e);
    groups.set(key, g);
  }

  const withheld = { responses: 0, tokens: 0 };
  const invalidRids = new Set();
  const built = [];
  for (const group of groups.values()) {
    const first = group[0];
    const sum = (f) => group.reduce((a, e) => a + e[f], 0);
    const tokensInRaw = sum("tokensIn");
    const tokensOutRaw = sum("tokensOut");
    const responses = Math.min(group.length, CAP_RESPONSES_PER_DAY);
    const tokensIn = Math.min(tokensInRaw, CAP_TOKENS_PER_DAY);
    const tokensOut = Math.min(tokensOutRaw, CAP_TOKENS_PER_DAY);
    withheld.responses += group.length - responses;
    withheld.tokens += tokensInRaw - tokensIn + (tokensOutRaw - tokensOut);
    const bucket = {
      schema: COMMUNITY_SCHEMA,
      day: first.day,
      provider: first.provider,
      model: first.model,
      host: first.host,
      tokenSource: first.tokenSource,
      responses,
      tokensIn,
      tokensOut,
      cacheReadTokens: Math.min(sum("cacheReadTokens"), tokensIn),
      cacheWriteTokens: Math.min(sum("cacheWriteTokens"), tokensIn),
      aiedsModelVersion: first.aiedsModelVersion,
    };
    if (typeof first.aiedsVersion === "string") bucket.aiedsVersion = first.aiedsVersion;
    bucket.energyWh = round(sum("energyWh"), 6);
    bucket.carbonG = round(sum("carbonG"), 6);
    bucket.waterL = round(sum("waterMl") / 1000, 6);
    bucket.treeTimeMin = round(sum("treeTimeMin"), 6);
    const rids = group.map((e) => e.rid);
    if (bucketProblem(bucket) !== null) {
      for (const r of rids) invalidRids.add(r);
      continue;
    }
    built.push({ bucket, rids });
  }
  built.sort((a, b) => {
    const ka = [a.bucket.day, a.bucket.provider, a.bucket.model, a.bucket.host, a.bucket.tokenSource].join("|");
    const kb = [b.bucket.day, b.bucket.provider, b.bucket.model, b.bucket.host, b.bucket.tokenSource].join("|");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const batches = [];
  for (let i = 0; i < built.length; i += MAX_BUCKETS_PER_REQUEST) {
    const chunk = built.slice(i, i + MAX_BUCKETS_PER_REQUEST);
    const buckets = chunk.map((c) => c.bucket);
    batches.push({ body: JSON.stringify({ buckets }), buckets, ridGroups: chunk.map((c) => c.rids) });
  }
  return { batches, open, expiredRids, invalidRids, withheld };
}

// -- Talking to the service --------------------------------------------------------------------

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function retryable(res) {
  if (res.status === 0) return true;
  if (res.status === 503) return false; // paused or unavailable: waiting seconds will not help
  if (res.status >= 500) return true;
  return res.status === 429 && Number(res.body.retryAfterSec) <= 5;
}

/**
 * One POST to a community function. At most `retries` more tries (default 2),
 * with a backoff. Never throws. AIEDS_CONTRIBUTE=off makes NO network call and
 * answers { status: 0, blocked: true }.
 */
export async function callApi(fn, body, { endpoint, token, env = process.env, fetchImpl, sleepImpl = realSleep, retries = 2, timeoutMs = 10_000 }) {
  if (contributeDisabled(env)) return { status: 0, body: {}, blocked: true };
  let res = { status: 0, body: {} };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    res = await postJson(functionUrl(endpoint, fn), body, { token, fetchImpl, timeoutMs });
    if (!retryable(res) || attempt === retries) return res;
    await sleepImpl(Math.min(backoffMs(attempt + 1, undefined) / 10, 4000));
  }
  return res;
}

/** One plain sentence for a failed answer. Never contains the token or a server-supplied string. */
export function plainProblem(res) {
  if (res.blocked) return "AIEDS_CONTRIBUTE is off, so nothing was sent.";
  const code = typeof res.body?.error === "string" ? res.body.error : "";
  if (res.status === 0) return "Could not reach the community service. Check your connection and try again.";
  if (code === "paused") return "Contributing is paused right now. Your numbers stay on this computer until it is back.";
  if (res.status === 404 || code === "unavailable") return "Community totals are not available yet.";
  if (res.status === 401) return "This computer is no longer signed in for contributing. Run `aieds contribute on` to turn it on again.";
  if (code === "consent_required") return "The consent text changed. Run `aieds contribute on` to read it and turn contributing on again.";
  if (res.status === 426) return "The service needs a newer aieds. Update with: npm i -g @randomknights/aieds";
  if (res.status === 429) return "Too many requests right now. Try again in a minute.";
  if (res.status >= 500) return "The community service had a problem. Try again later.";
  const safe = /^[a-z_]{1,40}$/.test(code) ? ` (${code})` : "";
  return `The community service refused the request${safe}.`;
}

// -- Sending ----------------------------------------------------------------------------------

/**
 * Sends the closed days in the queue. Never throws. Returns
 * { state, sent, replaced, rejected, kept, open, error?, res? } with state one
 * of: off, not-on, blocked, busy, empty, done, retry, paused, unavailable,
 * consent, revoked, dropped.
 */
export async function submitQueue({
  env = process.env,
  fetchImpl,
  sleepImpl,
  nowMs = Date.now(),
  retries = 2,
  budgetMs = 15_000,
} = {}) {
  const summary = { state: "done", sent: 0, replaced: 0, rejected: 0, kept: 0, open: 0, buckets: 0, responses: 0 };
  let release;
  try {
    if (contributeDisabled(env)) return { ...summary, state: "off" };
    const conn = loadContribute(env);
    if (conn === undefined || !conn.enabled) return { ...summary, state: "not-on" };
    if (endpointProblem(conn.endpoint) !== null) return { ...summary, state: "blocked" };
    release = takeLock(env, nowMs, paths(env).contributeLock);
    if (release === undefined) return { ...summary, state: "busy" };

    const state = loadCState(env);
    const up = buildUploads(readCQueue(env), { nowMs });
    summary.open = up.open;
    const stale = new Set([...up.expiredRids, ...up.invalidRids]);
    if (stale.size > 0) {
      removeRids(stale, env);
      state.expired += up.expiredRids.size;
      state.dropped += up.invalidRids.size;
      saveCState(state, env);
    }
    if (up.batches.length === 0) {
      summary.kept = readCQueue(env).length;
      return { ...summary, state: "empty" };
    }

    state.lastAttemptDay = utcDay(nowMs);
    const deadline = Date.now() + budgetMs;
    let tIn = 0;
    let tOut = 0;
    for (const batch of up.batches) {
      const remaining = deadline - Date.now();
      if (remaining < 250) {
        summary.state = "retry";
        break;
      }
      const res = await callApi("communitySubmit", batch.body, {
        endpoint: conn.endpoint, token: conn.token, env, fetchImpl, sleepImpl, retries, timeoutMs: remaining,
      });
      if (res.status === 200) {
        const rejected = Array.isArray(res.body.rejected) ? res.body.rejected : [];
        const keepIdx = new Set();
        let permanent = 0;
        for (const r of rejected) {
          const reason = typeof r?.reason === "string" ? r.reason : "";
          if (RETRY_LATER_REASONS.has(reason) && Number.isInteger(r.index)) keepIdx.add(r.index);
          else permanent += 1;
        }
        const done = new Set();
        batch.ridGroups.forEach((rids, i) => {
          if (keepIdx.has(i)) return;
          for (const rid of rids) done.add(rid);
          if (!rejected.some((r) => r?.index === i)) {
            summary.buckets += 1;
            summary.responses += batch.buckets[i].responses;
            tIn += batch.buckets[i].tokensIn;
            tOut += batch.buckets[i].tokensOut;
          }
        });
        removeRids(done, env);
        summary.sent += Number.isInteger(res.body.accepted) ? res.body.accepted : 0;
        summary.replaced += Number.isInteger(res.body.replaced) ? res.body.replaced : 0;
        summary.rejected += permanent;
        state.lastSentDay = utcDay(nowMs);
        state.lastError = permanent > 0 ? "some_rejected" : keepIdx.size > 0 ? "some_kept" : "";
        if (keepIdx.size > 0) summary.state = "retry";
        continue;
      }
      state.lastError = res.blocked ? "blocked" : res.status === 0 ? "network" : (typeof res.body.error === "string" ? res.body.error.slice(0, 40) : `http_${res.status}`);
      summary.error = state.lastError;
      summary.res = res;
      if (res.status === 401) {
        // Revoked or unknown token: contributing is off here. Keep nothing.
        saveCState(state, env);
        clearContribute(env);
        return { ...summary, state: "revoked", kept: 0 };
      }
      if (res.body.error === "consent_required") summary.state = "consent";
      else if (res.body.error === "paused") summary.state = "paused";
      else if (res.status === 404 || res.body.error === "unavailable") summary.state = "unavailable";
      else if (res.status === 0 || res.status === 429 || res.status === 426 || res.status >= 500) summary.state = "retry";
      else {
        // The payload itself is wrong: drop this batch and stop.
        const bad = new Set(batch.ridGroups.flat());
        removeRids(bad, env);
        state.dropped += bad.size;
        summary.state = "dropped";
      }
      break;
    }
    if (summary.buckets > 0) {
      state.lastSentBuckets = summary.buckets;
      state.lastSentResponses = summary.responses;
      state.lastSentTokensIn = tIn;
      state.lastSentTokensOut = tOut;
    }
    saveCState(state, env);
    summary.kept = readCQueue(env).length;
    return summary;
  } catch {
    return { ...summary, state: "retry", error: "internal" };
  } finally {
    if (release) release();
  }
}

/**
 * The hook's daily send: when contributing is on, no attempt was made today
 * (UTC), and there is a closed day waiting. Bounded, no retries, never throws.
 */
export async function maybeSubmitDaily({ env = process.env, fetchImpl, nowMs = Date.now(), budgetMs = 2500 } = {}) {
  try {
    if (!contributeActive(env)) return undefined;
    if (loadCState(env).lastAttemptDay === utcDay(nowMs)) return undefined;
    return await submitQueue({ env, fetchImpl, nowMs, retries: 0, budgetMs });
  } catch {
    return undefined;
  }
}

/** Counts for `status`: distinct days queued, responses queued, closed days ready. */
export function queueSummary(env = process.env, nowMs = Date.now()) {
  const q = readCQueue(env);
  const today = utcDay(nowMs);
  const days = new Set(q.map((e) => e.day));
  const ready = new Set(q.filter((e) => e.day < today && dayAge(e.day, today) <= MAX_DAY_AGE_DAYS).map((e) => e.day));
  return { responses: q.length, days: days.size, readyDays: ready.size };
}

export { CLIENT_NAME, CLIENT_VERSION };

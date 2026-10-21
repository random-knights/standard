// The per-response receipt format, rk-receipts/1 (SYNC-SPEC section 4).
//
// ONE receipt is ONE model response (a turn), with a client-computed id (`rid`)
// so the same response can never be counted twice, however many times it is
// read, queued, retried or uploaded. The plugin's older local log line is
// session-cumulative and cannot be summed; this format can.
//
// The table below is the PRIVACY ALLOWLIST. It is a copy of the server's table
// (ruok functions/src/sync/schema.ts, SYNC-SPEC 4.2): the client builds a
// receipt from these fields and nothing else, and checks its own output against
// the same rules before it queues anything, so a payload the server would reject
// as unknown never leaves the machine. There is deliberately no field for a
// prompt, a reply, a file or folder name, a project, a session id, a hostname,
// an e-mail address, an API key or a tool name.

import { createHash } from "node:crypto";

import { disclose } from "./core.mjs";
import { FACTORS } from "../vendor/lib/dist/index.js";

export const RECEIPT_SCHEMA = "rk-receipts/1";
export const MAX_RECEIPTS_PER_BATCH = 100;
export const MAX_FUTURE_MS = 5 * 60 * 1000;
export const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

/** The `client.host` values the server accepts (v1 ships claude, codex, copilot, grok, ollama). */
export const CLIENT_HOSTS = Object.freeze([
  "claude", "codex", "gemini", "cursor", "windsurf", "copilot", "opencode",
  "cline", "roo", "aider", "zed", "continue", "amp", "goose", "ollama",
  "lmstudio", "grok", "proxy", "otel", "file", "other",
]);

const TOKEN_SOURCES = ["reported", "estimated"];
const PROVENANCES = ["measured", "vendor-published", "class-estimated", "synthetic", "unknown"];
const CONFIDENCES = ["low", "med", "high"];
const ACTIVITIES = ["chat", "code", "review", "test", "docs", "search", "other"];

/** Which receipt fields exist, their rule and whether they are required. */
export const RECEIPT_FIELDS = Object.freeze({
  rid: { kind: "pattern", re: /^[0-9a-f]{32}$/, required: true },
  tsUtc: { kind: "iso", required: true },
  provider: { kind: "pattern", re: /^[a-z0-9._-]{1,40}$/, guard: true, required: true },
  model: { kind: "pattern", re: /^[A-Za-z0-9._:/@+-]{1,100}$/, guard: true, required: true },
  tokensIn: { kind: "int", min: 0, max: 5_000_000, required: true },
  tokensOut: { kind: "int", min: 0, max: 5_000_000, required: true },
  cacheReadTokens: { kind: "int", min: 0, max: 5_000_000, required: false },
  cacheWriteTokens: { kind: "int", min: 0, max: 5_000_000, required: false },
  tokenSource: { kind: "enum", values: TOKEN_SOURCES, required: true },
  energyWh: { kind: "num", min: 0, max: 5000, required: true },
  carbonG: { kind: "num", min: 0, max: 5000, required: true },
  waterMl: { kind: "num", min: 0, max: 100_000, required: false },
  treeTimeMin: { kind: "num", min: 0, max: 1e7, required: true },
  aiedsModelVersion: { kind: "pattern", re: /^v[0-9]{1,2}$/, required: true },
  aiedsVersion: { kind: "pattern", re: /^[0-9]+\.[0-9]+\.[0-9]+$/, required: false },
  provenance: { kind: "enum", values: PROVENANCES, required: false },
  confidence: { kind: "enum", values: CONFIDENCES, required: false },
  agentId: { kind: "pattern", re: /^[a-z0-9._-]{1,40}$/, guard: true, required: false },
  activity: { kind: "enum", values: ACTIVITIES, required: false },
  latencyMs: { kind: "int", min: 0, max: 3_600_000, nullable: true, required: false },
});

/** The only keys a receipt may carry, in the order they are written. */
export const RECEIPT_FIELD_NAMES = Object.freeze(Object.keys(RECEIPT_FIELDS));

/** The only keys of the batch `client` object. */
export const CLIENT_FIELD_NAMES = Object.freeze(["name", "version", "host"]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** A long opaque run, a key prefix, a drive-letter or leading/dotted path. */
export function looksLikeSecretOrPath(s) {
  if (/[A-Za-z0-9]{32,}/.test(s)) return true;
  if (/^(sk|pk|rk|ghp|gho|ghs|xox[a-z]|aiza|akia|rkd)[-_]/i.test(s)) return true;
  if (/^[A-Za-z]:[\\/]/.test(s)) return true;
  if (s.startsWith("/") || s.startsWith("~") || s.includes("..") || s.includes("//")) return true;
  if ((s.match(/\//g) ?? []).length > 3) return true;
  return false;
}

export function checkValue(rule, value) {
  switch (rule.kind) {
    case "pattern":
      return (
        typeof value === "string" &&
        rule.re.test(value) &&
        !(rule.guard === true && looksLikeSecretOrPath(value))
      );
    case "int":
      if (value === null) return rule.nullable === true;
      return Number.isInteger(value) && value >= rule.min && value <= rule.max;
    case "num":
      return typeof value === "number" && Number.isFinite(value) && value >= rule.min && value <= rule.max;
    case "enum":
      return typeof value === "string" && rule.values.includes(value);
    case "iso":
      return typeof value === "string" && ISO_RE.test(value) && Number.isFinite(Date.parse(value));
    default:
      return false;
  }
}

/**
 * Checks one receipt the way the server will. Returns null when it passes, or a
 * short reason naming the FIELD (never its value). Unknown keys fail: that is
 * the point of the allowlist.
 */
export function receiptProblem(r, nowMs = Date.now()) {
  if (r === null || typeof r !== "object" || Array.isArray(r)) return "not_an_object";
  for (const key of Object.keys(r)) {
    if (!RECEIPT_FIELD_NAMES.includes(key)) return `unknown_field:${/^[A-Za-z0-9_.-]{1,40}$/.test(key) ? key : "(invalid name)"}`;
  }
  for (const [name, rule] of Object.entries(RECEIPT_FIELDS)) {
    const present = Object.prototype.hasOwnProperty.call(r, name) && r[name] !== undefined;
    if (!present) {
      if (rule.required) return `missing_${name}`;
      continue;
    }
    if (!checkValue(rule, r[name])) return `invalid_${name}`;
  }
  const ts = Date.parse(r.tsUtc);
  if (ts > nowMs + MAX_FUTURE_MS || ts < nowMs - MAX_AGE_MS) return "invalid_tsUtc";
  for (const f of ["cacheReadTokens", "cacheWriteTokens"]) {
    if (typeof r[f] === "number" && r[f] > r.tokensIn) return `invalid_${f}`;
  }
  const total = r.tokensIn + r.tokensOut;
  if (total <= 0) return "implausible_tokens";
  if (r.energyWh / (total / 1000) > 50) return "implausible_energy";
  if (r.carbonG > r.energyWh * 2) return "implausible_carbon";
  return null;
}

// -- Identity of a response -----------------------------------------------------

/**
 * The idempotency key: the first 32 hex characters of
 * sha256(host | sessionId | turnKey). The session id is hashed here and never
 * leaves the machine in any other form.
 */
export function ridFor(host, sessionId, turnKey) {
  return createHash("sha256")
    .update(`${host}|${sessionId}|${turnKey}`)
    .digest("hex")
    .slice(0, 32);
}

/** A stable hash for local bookkeeping (read-position keys). */
export function shortHash(text) {
  return createHash("sha256").update(String(text)).digest("hex").slice(0, 32);
}

// -- Building receipts ------------------------------------------------------------

const AGENT_IDS = Object.freeze({
  claude: "claude-code",
  codex: "codex",
  copilot: "copilot-cli",
  grok: "grok",
  ollama: "ollama",
});

export function providerSlug(label) {
  const s = String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s.length > 0 ? s : "other";
}

function modelId(model) {
  const m = typeof model === "string" ? model : "";
  return RECEIPT_FIELDS.model.re.test(m) && !looksLikeSecretOrPath(m) ? m : "unknown";
}

function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function waterMlOf(d) {
  const v = d.water?.waterMl?.default;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * One receipt per model for a set of calls that belong to ONE response. A
 * response that used two models (a subagent) gives two receipts, because each
 * model has its own coefficient; the second carries the model in its rid.
 *
 * `calls` use the call shape of hosts.mjs. `ctx`: { host, sessionId, turnKey,
 * tsMs, tokenSource? , provider? }.
 */
export function receiptsFromCalls(calls, ctx) {
  const groups = new Map();
  for (const c of calls) {
    const key = `${c.provider ?? ""}\u0000${c.model ?? ""}`;
    const g = groups.get(key) ?? [];
    g.push(c);
    groups.set(key, g);
  }
  const out = [];
  for (const group of groups.values()) {
    const d = disclose(group);
    if (d.tokens.input + d.tokens.output <= 0) continue;
    const model = modelId(group[0].model);
    const turnKey = groups.size > 1 ? `${ctx.turnKey}|${model}` : ctx.turnKey;
    const receipt = {
      rid: ridFor(ctx.host, ctx.sessionId ?? "", turnKey),
      tsUtc: new Date(ctx.tsMs).toISOString(),
      provider: providerSlug(group[0].provider ?? ctx.provider),
      model,
      tokensIn: d.tokens.input,
      tokensOut: d.tokens.output,
      cacheReadTokens: d.tokens.cacheRead,
      cacheWriteTokens: d.tokens.cacheCreation,
      tokenSource: ctx.tokenSource ?? "reported",
      energyWh: round(d.energyWh, 6),
      carbonG: round(d.carbonGrams, 6),
      treeTimeMin: round(d.treeTimeMinutes, 6),
      aiedsModelVersion: ctx.aiedsModelVersion ?? FACTORS.impactModelVersion,
      aiedsVersion: d.methodologyVersion,
      provenance: d.provenance,
      confidence: d.confidence,
      agentId: AGENT_IDS[ctx.host] ?? providerSlug(ctx.agentId ?? group[0].provider),
    };
    const water = waterMlOf(d);
    if (water !== undefined) receipt.waterMl = round(water, 6);
    out.push({ host: ctx.host, receipt });
  }
  return out;
}

/** Groups the calls of a parsed session by turn number, in order. */
export function callsByTurn(parsed) {
  const turns = new Map();
  for (const c of parsed.calls) {
    const list = turns.get(c.turn) ?? [];
    list.push(c);
    turns.set(c.turn, list);
  }
  return [...turns.entries()].sort((a, b) => a[0] - b[0]).map(([turn, calls]) => ({ turn, calls }));
}

/** The stable id of a response: the host's own turn id when it has one. */
export function turnKeyOf(host, calls) {
  const last = calls[calls.length - 1];
  if (host === "codex") {
    const withId = [...calls].reverse().find((c) => typeof c.turnId === "string" && c.turnId.length > 0);
    return withId ? withId.turnId : last.id;
  }
  if (host === "grok") return String(last.id).split(":")[0];
  return String(last.id);
}

/** The time of a response: the newest call timestamp the host recorded, else `fallbackMs`. */
export function tsOfCalls(calls, fallbackMs) {
  let best = 0;
  for (const c of calls) if (Number.isFinite(c.tsMs) && c.tsMs > best) best = c.tsMs;
  return best > 0 ? best : fallbackMs;
}

/**
 * Per-response receipts for the LATEST response of a parsed session (what a
 * Stop hook reports), or for every response (`all: true`, for the on-demand
 * Grok receipt and for a receipts file).
 */
export function receiptsFromParsed(parsed, ctx, { all = false } = {}) {
  const host = ctx.host;
  const turns = callsByTurn(parsed);
  const wanted = all ? turns : turns.filter((t) => t.turn === parsed.lastTurn);
  const out = [];
  for (const t of wanted) {
    out.push(
      ...receiptsFromCalls(t.calls, {
        ...ctx,
        host,
        turnKey: turnKeyOf(host, t.calls),
        // A live hook stamps the response with "now". Reading a file later
        // (receipt --all) uses the time the host recorded for the response.
        tsMs: ctx.useRecordTime === true ? tsOfCalls(t.calls, ctx.tsMs) : ctx.tsMs,
      }),
    );
  }
  return out;
}

/** The request body for one batch (all entries share one host). */
export function batchBody(host, receipts, client) {
  return {
    schema: RECEIPT_SCHEMA,
    client: { name: client.name, version: client.version, host },
    receipts,
  };
}

/** One line of the receipts file (AIEDS_RECEIPT_LOG_FORMAT=rk-receipts): the receipt object, alone. */
export function receiptLogLine(receipt) {
  return JSON.stringify(receipt);
}

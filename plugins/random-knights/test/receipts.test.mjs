// rk-receipts/1: per-response receipts, the allowlist, idempotent ids, and the
// proof that each reader's token counts equal the host's own reported usage.
import assert from "node:assert/strict";
import test from "node:test";

import { disclose, parseTranscript, receiptFor } from "../scripts/core.mjs";
import { parseCodexRollout, parseGrokSession } from "../scripts/hosts.mjs";
import {
  CLIENT_HOSTS,
  RECEIPT_FIELD_NAMES,
  looksLikeSecretOrPath,
  receiptProblem,
  receiptsFromParsed,
  ridFor,
} from "../scripts/receipts.mjs";
import { sessionIdFromPath } from "../scripts/aieds.mjs";
import { fixtureText } from "./helpers.mjs";

const NOW = Date.parse("2026-10-20T15:00:00.000Z");
const ctx = (host, extra = {}) => ({ host, sessionId: "session-1", tsMs: NOW, ...extra });

function good(overrides = {}) {
  return {
    rid: "9f2c1a7e5b3d4c60a8e1f0b2c4d6e8a1",
    tsUtc: new Date(NOW).toISOString(),
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    tokensIn: 52310,
    tokensOut: 1204,
    cacheReadTokens: 48200,
    cacheWriteTokens: 3100,
    tokenSource: "reported",
    energyWh: 0.4412,
    carbonG: 0.1893,
    waterMl: 1.2,
    treeTimeMin: 4.7,
    aiedsModelVersion: "v2",
    aiedsVersion: "2.5.0",
    provenance: "class-estimated",
    confidence: "low",
    agentId: "claude-code",
    ...overrides,
  };
}

// -- The allowlist ---------------------------------------------------------------

test("allowlist: the example receipt passes and has no key outside the table", () => {
  assert.equal(receiptProblem(good(), NOW), null);
  for (const k of Object.keys(good())) assert.ok(RECEIPT_FIELD_NAMES.includes(k), k);
});

test("allowlist: an unknown key fails by NAME, never by value", () => {
  for (const key of ["cwd", "prompt", "sessionId", "hostname", "email", "filePath", "toolName"]) {
    const reason = receiptProblem({ ...good(), [key]: "CANARY-DO-NOT-STORE" }, NOW);
    assert.equal(reason, `unknown_field:${key}`);
    assert.ok(!reason.includes("CANARY"));
  }
});

test("allowlist: paths, sentences, urls and key shapes cannot ride in model, provider or agentId", () => {
  const bad = [
    "C:\\Users\\kit\\secret",
    "/home/kit/project",
    "../up",
    "~/notes",
    "a sentence with spaces",
    "https://example.com/x",
    "sk-" + "a".repeat(40),
    "a".repeat(40),
    "meta/a/b/c/d/e",
  ];
  for (const value of bad) {
    assert.ok(receiptProblem(good({ model: value }), NOW), `model ${value}`);
    assert.ok(receiptProblem(good({ provider: value }), NOW), `provider ${value}`);
    assert.ok(receiptProblem(good({ agentId: value }), NOW), `agentId ${value}`);
  }
  assert.equal(receiptProblem(good({ model: "meta-llama/Llama-3.1-8B" }), NOW), null);
  assert.equal(receiptProblem(good({ model: "llama3.2:1b" }), NOW), null);
  assert.ok(looksLikeSecretOrPath("D:/work"));
});

test("allowlist: bounds, enums, time window and plausibility", () => {
  assert.ok(receiptProblem(good({ tokensIn: -1 }), NOW));
  assert.ok(receiptProblem(good({ tokensIn: 5_000_001 }), NOW));
  assert.ok(receiptProblem(good({ tokensIn: 1.5 }), NOW));
  assert.ok(receiptProblem(good({ energyWh: Number.NaN }), NOW));
  assert.ok(receiptProblem(good({ energyWh: 5001 }), NOW));
  assert.ok(receiptProblem(good({ tokenSource: "guessed" }), NOW));
  assert.ok(receiptProblem(good({ tsUtc: "2026-10-20 15:00:00" }), NOW));
  assert.ok(receiptProblem(good({ tsUtc: new Date(NOW + 10 * 60 * 1000).toISOString() }), NOW));
  assert.ok(receiptProblem(good({ tsUtc: new Date(NOW - 401 * 86400000).toISOString() }), NOW));
  assert.ok(receiptProblem(good({ cacheReadTokens: 60000 }), NOW));
  assert.ok(receiptProblem(good({ energyWh: 1e6 }), NOW));
  assert.ok(receiptProblem(good({ energyWh: 4000, carbonG: 1 }), NOW), "50 Wh per 1000 tokens bound");
  assert.ok(receiptProblem(good({ carbonG: 5 }), NOW), "carbon above 2x energy");
  assert.ok(receiptProblem(good({ tokensIn: 0, tokensOut: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }), NOW));
  assert.equal(receiptProblem(good({ latencyMs: null }), NOW), null);
  assert.equal(receiptProblem(good({ confidence: "high", provenance: "measured", activity: "code" }), NOW), null);
});

test("allowlist: the host enum matches the backend and v1 hosts are in it", () => {
  for (const h of ["claude", "codex", "copilot", "grok", "ollama", "file", "other"]) {
    assert.ok(CLIENT_HOSTS.includes(h), h);
  }
});

// -- Identity ---------------------------------------------------------------------

test("rid: 32 hex, stable, and different for a different session or turn", () => {
  const a = ridFor("claude", "s", "t");
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(a, ridFor("claude", "s", "t"));
  assert.notEqual(a, ridFor("claude", "s2", "t"));
  assert.notEqual(a, ridFor("claude", "s", "t2"));
  assert.notEqual(a, ridFor("codex", "s", "t"));
});

test("session id from a path matches what each host's hook reports", () => {
  assert.equal(
    sessionIdFromPath("C:\\Users\\a b\\.claude\\projects\\p\\0f2b8a64-1c5e-4c0a-9d3e-6a7b8c9d0e1f.jsonl"),
    "0f2b8a64-1c5e-4c0a-9d3e-6a7b8c9d0e1f",
  );
  assert.equal(
    sessionIdFromPath("/home/x/.codex/sessions/2026/10/20/rollout-2026-10-20T10-11-10-01a159a6-dede-74a0-a36b-7309310bfe20.jsonl"),
    "01a159a6-dede-74a0-a36b-7309310bfe20",
  );
  assert.equal(sessionIdFromPath("/h/.grok/sessions/C%3A%5Cx/01a159a9-d852-76b2-acb0-761766a0224e/updates.jsonl"), "01a159a9-d852-76b2-acb0-761766a0224e");
});

// -- Per-response, not cumulative ----------------------------------------------------

test("claude: one receipt per response; their sum is the session total (no double count)", () => {
  const parsed = parseTranscript(fixtureText("session-tool-turns.jsonl"));
  const all = receiptsFromParsed(parsed, ctx("claude"), { all: true });
  assert.equal(all.length, 2, "two turns, two receipts");
  const last = receiptsFromParsed(parsed, ctx("claude"));
  assert.equal(last.length, 1, "a Stop hook reports only the latest response");
  assert.equal(last[0].receipt.rid, all[1].receipt.rid);

  const session = receiptFor(parsed).session;
  const tokensIn = all.reduce((n, e) => n + e.receipt.tokensIn, 0);
  const tokensOut = all.reduce((n, e) => n + e.receipt.tokensOut, 0);
  assert.equal(tokensIn, session.tokens.input);
  assert.equal(tokensOut, session.tokens.output);
  const energy = all.reduce((n, e) => n + e.receipt.energyWh, 0);
  assert.ok(Math.abs(energy - session.energyWh) < 1e-4, `${energy} vs ${session.energyWh}`);
  for (const e of all) assert.equal(receiptProblem(e.receipt, NOW), null);
});

test("claude: the same transcript read twice gives the same rids", () => {
  const text = fixtureText("session-tool-turns.jsonl");
  const a = receiptsFromParsed(parseTranscript(text), ctx("claude"), { all: true }).map((e) => e.receipt.rid);
  const b = receiptsFromParsed(parseTranscript(text), ctx("claude"), { all: true }).map((e) => e.receipt.rid);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test("claude: a response that used two models gives two receipts, each with its own model", () => {
  const parsed = parseTranscript(fixtureText("session-mixed-models.jsonl"));
  const all = receiptsFromParsed(parsed, ctx("claude"), { all: true });
  const byTurn = new Map();
  for (const e of all) byTurn.set(e.receipt.tsUtc + e.receipt.rid, e);
  const models = new Set(all.map((e) => e.receipt.model));
  assert.ok(models.size >= 2, [...models].join(","));
  assert.equal(new Set(all.map((e) => e.receipt.rid)).size, all.length);
});

test("claude: receipt tokens equal the transcript's own usage counters", () => {
  const text = fixtureText("session-tool-turns.jsonl");
  const parsed = parseTranscript(text);
  const e = receiptsFromParsed(parsed, ctx("claude"))[0].receipt;
  const latest = parsed.calls.filter((c) => c.turn === parsed.lastTurn);
  const sum = (f) => latest.reduce((n, c) => n + c.usage[f], 0);
  assert.equal(e.tokensIn, sum("input_tokens") + sum("cache_creation_input_tokens") + sum("cache_read_input_tokens"));
  assert.equal(e.tokensOut, sum("output_tokens"));
  assert.equal(e.cacheReadTokens, sum("cache_read_input_tokens"));
  assert.equal(e.cacheWriteTokens, sum("cache_creation_input_tokens"));
  assert.equal(e.aiedsModelVersion, "v2");
  assert.equal(e.agentId, "claude-code");
  assert.equal(e.tokenSource, "reported");
});

// -- Real-session fixtures ---------------------------------------------------------------

test("codex (real 0.162.1 run): counts equal Codex's own last and total usage", () => {
  const text = fixtureText("codex-real-0.162.1.jsonl");
  const parsed = parseCodexRollout(text);
  assert.equal(parsed.calls.length, 1);
  const own = JSON.parse(text.split("\n").find((l) => l.includes('"token_count"'))).payload.info;
  const entries = receiptsFromParsed(parsed, ctx("codex"));
  assert.equal(entries.length, 1);
  const r = entries[0].receipt;
  assert.equal(r.tokensIn, own.last_token_usage.input_tokens, "Codex input_tokens already includes cached");
  assert.equal(r.tokensIn, own.total_token_usage.input_tokens);
  assert.equal(r.cacheReadTokens, own.last_token_usage.cached_input_tokens);
  assert.equal(r.tokensOut, own.last_token_usage.output_tokens);
  assert.equal(r.model, "gpt-5.6-terra");
  assert.equal(r.provider, "openai");
  // These are the figures the owner saw printed on the same run.
  assert.deepEqual([r.tokensIn, r.cacheReadTokens, r.cacheWriteTokens, r.tokensOut], [28142, 2816, 0, 14]);
  assert.equal(receiptProblem(r, Date.parse("2026-10-20T15:00:00Z")), null);
  assert.equal(r.rid, ridFor("codex", "session-1", "turn-REAL-2"), "the rid uses Codex's own turn id");
});

test("grok (real 1.0.50 session): counts equal Grok's own turn_completed usage", () => {
  const text = fixtureText("grok-real-1.0.50.jsonl");
  const own = JSON.parse(text.split("\n")[0]).params.update.usage;
  const parsed = parseGrokSession(text);
  const entries = receiptsFromParsed(parsed, ctx("grok", { useRecordTime: true }));
  assert.equal(entries.length, 1);
  const r = entries[0].receipt;
  assert.equal(r.tokensIn, own.inputTokens, "inputTokens is the whole prompt, cache included");
  assert.equal(r.cacheReadTokens, own.cachedReadTokens);
  assert.equal(r.tokensOut, own.outputTokens);
  assert.equal(r.model, "grok-4.7");
  assert.equal(r.provider, "xai");
  assert.equal(r.agentId, "grok");
  assert.equal(r.tsUtc, new Date(1792505693 * 1000).toISOString(), "the record's own time, read as seconds");
  assert.equal(receiptProblem(r, Date.parse("2026-10-20T15:00:00Z")), null);
  assert.equal(r.rid, ridFor("grok", "session-1", "prompt-REAL-1"));
});

test("grok: every prompt of a session becomes receipts with --all, one per prompt and model", () => {
  const parsed = parseGrokSession(fixtureText("grok-updates.jsonl"));
  const all = receiptsFromParsed(parsed, ctx("grok"), { all: true });
  assert.equal(all.length, parsed.calls.length);
  assert.equal(new Set(all.map((e) => e.receipt.rid)).size, all.length);
});

test("a disclosure and its receipt agree: energy comes from the library, rounded only", () => {
  const parsed = parseTranscript(fixtureText("session-tool-turns.jsonl"));
  const latest = parsed.calls.filter((c) => c.turn === parsed.lastTurn);
  const d = disclose(latest);
  const r = receiptsFromParsed(parsed, ctx("claude"))[0].receipt;
  assert.ok(Math.abs(r.energyWh - d.energyWh) < 1e-6);
  assert.ok(Math.abs(r.carbonG - d.carbonGrams) < 1e-6);
  assert.ok(Math.abs(r.treeTimeMin - d.treeTimeMinutes) < 1e-6);
  assert.ok(r.waterMl > 0);
});

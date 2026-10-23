// The whole sync path against a FAKE backend: connect, hook, queue, flush, the
// 4xx drop, offline queueing, the time budget, revoke, and "no network unless
// connected". The real staging backend (ruok PR 687) is not deployed yet, so
// nothing here proves the deployed service; it proves the client against the
// backend's documented contract.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { receiptProblem, RECEIPT_FIELD_NAMES } from "../scripts/receipts.mjs";
import { loadState, readQueue } from "../scripts/store.mjs";
import { flushQueue } from "../scripts/syncclient.mjs";
import { queueAndFlush } from "../scripts/syncflow.mjs";
import {
  connectDirect,
  fixture,
  hermeticEnv,
  runCli,
  startFakeServer,
  tmpDir,
} from "./helpers.mjs";

const CLAUDE_FIXTURE = fixture("session-tool-turns.jsonl");

function claudeHookInput(extra = {}) {
  return JSON.stringify({
    session_id: "00000000-0000-4000-8000-000000000001",
    transcript_path: CLAUDE_FIXTURE,
    hook_event_name: "Stop",
    ...extra,
  });
}

async function setup(prefix) {
  const dir = tmpDir();
  const server = await startFakeServer();
  const env = hermeticEnv(dir, { AIEDS_SYNC_ENDPOINT: server.base });
  return { dir, server, env, prefix };
}

function filesIn(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isFile()) out.push(p);
  }
  return out;
}

// -- connect ---------------------------------------------------------------------------

test("connect: consent text first, link and code, token stored and never printed", async () => {
  const { dir, server, env } = await setup();
  try {
    const r = await runCli(["connect", "--endpoint", server.base, "--label", "test box (win32)"], { env });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const consent = r.stdout.indexOf("Connect this device to your Random Knights account?");
    const link = r.stdout.indexOf("/reports/connect/?code=KNGT-7QMP");
    assert.ok(consent >= 0 && link > consent, "the consent text is printed before the link");
    assert.match(r.stdout, /We never send your prompts, the replies, file names, folder names, project names, API keys or your computer's name/);
    assert.match(r.stdout, /You must be 13 or older\./);
    assert.match(r.stdout, /Connected\./);

    const token = `rkd_${"T".repeat(43)}`;
    assert.ok(!r.stdout.includes(token) && !r.stderr.includes(token), "the token is never printed");
    const file = join(dir, "config", "sync.json");
    assert.ok(readFileSync(file, "utf8").includes(token));
    if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);

    assert.deepEqual(Object.keys(server.requests.length ? JSON.parse(server.requests[0].raw) : {}).sort(), ["client", "clientVersion", "deviceLabel"]);
    assert.equal(server.lastStart.deviceLabel, "test box (win32)");
    assert.equal(server.lastStart.client, "aieds-cli");

    const status = await runCli(["status"], { env });
    assert.match(status.stdout, /Sync: connected/);
    assert.ok(!status.stdout.includes(token));
    assert.match(status.stdout, /never printed/);
  } finally {
    await server.close();
  }
});

test("connect: without a terminal it does not send the computer's name", async () => {
  const { server, env } = await setup();
  try {
    await runCli(["connect", "--endpoint", server.base], { env });
    assert.match(server.lastStart.deviceLabel, /^(win32|linux|darwin) device$/);
  } finally {
    await server.close();
  }
});

test("connect: refuses a plain-http endpoint that is not this computer", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  const r = await runCli(["connect", "--endpoint", "http://example.com"], { env });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /must be https/);
  assert.ok(!existsSync(join(dir, "config", "sync.json")));
});

test("connect: already connected says so and stops; AIEDS_SYNC=off refuses", async () => {
  const { server, env } = await setup();
  try {
    await connectDirect(env, server);
    const again = await runCli(["connect", "--endpoint", server.base], { env });
    assert.match(again.stdout, /already connected/);
    assert.equal(server.requests.length, 0);
    const off = await runCli(["connect", "--endpoint", server.base], { env: { ...env, AIEDS_SYNC: "off" } });
    assert.match(off.stdout, /AIEDS_SYNC is off/);
  } finally {
    await server.close();
  }
});

// -- no network unless connected ------------------------------------------------------------

test("no sync.json: the hook, usage, flush and status make no network call at all", async () => {
  const { dir, server, env } = await setup();
  try {
    const hook = await runCli(["hook"], { input: claudeHookInput(), env });
    assert.match(hook.stdout, /this response {3}/);
    await runCli(["usage", "--provider", "T", "--model", "m", "--input", "100", "--output", "10"], { env });
    await runCli(["flush"], { env });
    await runCli(["status"], { env });
    assert.equal(server.requests.length, 0);
    assert.deepEqual(readdirSync(join(dir)).filter((n) => n === "config"), [], "no config dir is even created");
  } finally {
    await server.close();
  }
});

test("no sync.json: the library path never calls fetch", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("network");
  };
  const r = await queueAndFlush([], { env, fetchImpl });
  const f = await flushQueue({ env, fetchImpl });
  assert.equal(calls, 0);
  assert.equal(f.state, "not-connected");
  assert.equal(r.queued, 0);
});

// -- the hook sends the allowlist, once ---------------------------------------------------------

test("hook: the response's receipt reaches the backend, allowlisted, and a replay is a duplicate", async () => {
  const { dir, server, env } = await setup();
  try {
    await connectDirect(env, server);
    const h1 = await runCli(["hook"], { input: claudeHookInput(), env });
    assert.equal(h1.code, 0);
    assert.match(h1.stdout, /systemMessage/);
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.path, "syncReceipts");
    assert.equal(req.headers.authorization, `Bearer rkd_${"T".repeat(43)}`);
    assert.equal(req.headers.origin, undefined);
    const body = JSON.parse(req.raw);
    assert.equal(body.schema, "rk-receipts/1");
    assert.deepEqual(body.client, { name: "aieds-cli", version: "0.6.0", host: "claude" });
    assert.equal(body.receipts.length, 1, "one receipt for the latest response, not the session total");
    for (const r of body.receipts) {
      for (const k of Object.keys(r)) assert.ok(RECEIPT_FIELD_NAMES.includes(k), k);
      assert.equal(receiptProblem(r, Date.now()), null);
    }
    assert.equal(readQueue(env).length, 0, "sent, so removed from the queue");

    // The same response again (a re-run, a second device) is counted once.
    await runCli(["hook"], { input: claudeHookInput(), env });
    assert.equal(server.requests.length, 2);
    assert.equal(server.accepted.length, 1, "the backend wrote the rid once");
    const state = loadState(env);
    assert.equal(state.sent, 1);
    assert.equal(state.duplicates, 1);
    void dir;
  } finally {
    await server.close();
  }
});

test("hook: a transcript in a folder with spaces works (Windows-style paths)", async () => {
  const { dir, server, env } = await setup();
  try {
    await connectDirect(env, server);
    const spaced = join(dir, "My Projects", "a b");
    const { mkdirSync, copyFileSync } = await import("node:fs");
    mkdirSync(spaced, { recursive: true });
    const target = join(spaced, "00000000-0000-4000-8000-000000000001.jsonl");
    copyFileSync(CLAUDE_FIXTURE, target);
    const r = await runCli(["hook"], { input: claudeHookInput({ transcript_path: target }), env });
    assert.match(r.stdout, /systemMessage/);
    assert.equal(server.accepted.length, 1);
  } finally {
    await server.close();
  }
});

test("hook: AIEDS_SYNC=off prints the receipt, queues nothing, calls nothing", async () => {
  const { server, env } = await setup();
  try {
    await connectDirect(env, server);
    const r = await runCli(["hook"], { input: claudeHookInput(), env: { ...env, AIEDS_SYNC: "off" } });
    assert.match(r.stdout, /systemMessage/);
    assert.equal(server.requests.length, 0);
    assert.equal(readQueue(env).length, 0);
  } finally {
    await server.close();
  }
});

// -- offline, 4xx, 429, 401, budget -----------------------------------------------------------------

test("offline: a server error queues the receipt, backs off, and a later flush sends it", async () => {
  const { server, env } = await setup();
  try {
    await connectDirect(env, server);
    server.mode = "500";
    const h = await runCli(["hook"], { input: claudeHookInput(), env });
    assert.match(h.stdout, /systemMessage/, "the host still gets its receipt");
    assert.equal(h.code, 0);
    assert.equal(readQueue(env).length, 1);
    const state = loadState(env);
    assert.equal(state.failures, 1);
    assert.ok(state.nextAttemptAtMs > Date.now());
    assert.equal(server.requests.length, 1);

    // Inside the backoff window the hook queues but does not call.
    await runCli(["hook"], { input: claudeHookInput({ session_id: "00000000-0000-4000-8000-000000000002" }), env });
    assert.equal(server.requests.length, 1, "no request while backing off");
    assert.equal(readQueue(env).length, 2);

    server.mode = "ok";
    const flush = await runCli(["flush"], { env });
    assert.equal(flush.code, 0, flush.stdout);
    assert.match(flush.stdout, /Sent 2/);
    assert.equal(readQueue(env).length, 0);
    assert.equal(server.accepted.length, 2);
  } finally {
    await server.close();
  }
});

test("offline: nothing listening at all queues the receipt and exits 0", async () => {
  const { server, env } = await setup();
  await connectDirect(env, server);
  await server.close();
  const r = await runCli(["hook"], { input: claudeHookInput(), env });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /systemMessage/);
  assert.equal(readQueue(env).length, 1);
});

test("a 4xx that says the payload is wrong drops the batch and counts it", async () => {
  const { server, env } = await setup();
  try {
    await connectDirect(env, server);
    server.mode = "400";
    await runCli(["hook"], { input: claudeHookInput(), env });
    assert.equal(readQueue(env).length, 0, "retrying a rejected payload would never help");
    const state = loadState(env);
    assert.equal(state.dropped, 1);
    assert.equal(state.lastError, "invalid_request");
    const status = await runCli(["status"], { env });
    assert.match(status.stdout, /dropped: 1/);
  } finally {
    await server.close();
  }
});

test("429 keeps the queue and waits; the next hook does not call", async () => {
  const { server, env } = await setup();
  try {
    await connectDirect(env, server);
    server.mode = "429";
    await runCli(["hook"], { input: claudeHookInput(), env });
    assert.equal(readQueue(env).length, 1);
    const state = loadState(env);
    assert.ok(state.nextAttemptAtMs - Date.now() >= 55_000, "honors retryAfterSec");
    await runCli(["hook"], { input: claudeHookInput({ session_id: "00000000-0000-4000-8000-000000000009" }), env });
    assert.equal(server.requests.length, 1);
  } finally {
    await server.close();
  }
});

test("a rejected-model-version answer drops the receipts and tells the user to update", async () => {
  const { server, env } = await setup();
  try {
    await connectDirect(env, server);
    server.mode = "legacy";
    await runCli(["hook"], { input: claudeHookInput(), env });
    assert.equal(readQueue(env).length, 0);
    const state = loadState(env);
    assert.equal(state.rejected, 1);
    assert.equal(state.notice, "update_needed");
    const status = await runCli(["status"], { env });
    assert.match(status.stdout, /newer client/);
  } finally {
    await server.close();
  }
});

test("401 token_revoked: the token file and queue are deleted and status says so", async () => {
  const { dir, server, env } = await setup();
  try {
    await connectDirect(env, server);
    server.mode = "revoked";
    await runCli(["hook"], { input: claudeHookInput(), env });
    assert.ok(!existsSync(join(dir, "config", "sync.json")));
    assert.equal(readQueue(env).length, 0);
    const status = await runCli(["status"], { env });
    assert.match(status.stdout, /not connected/);
    assert.match(status.stdout, /disconnected from your account/);
    // Disconnected means no more calls.
    const before = server.requests.length;
    await runCli(["hook"], { input: claudeHookInput(), env });
    assert.equal(server.requests.length, before);
  } finally {
    await server.close();
  }
});

test("budget: a backend that never answers cannot hold the host for more than a few seconds", async () => {
  const { server, env } = await setup();
  try {
    await connectDirect(env, server);
    server.mode = "blackhole";
    const r = await runCli(["hook"], { input: claudeHookInput(), env });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /systemMessage/);
    assert.ok(r.ms < 7000, `took ${r.ms} ms`);
    assert.equal(readQueue(env).length, 1, "kept for later");
  } finally {
    await server.close();
  }
});

test("disconnect: tells the backend, deletes the token file and the queue", async () => {
  const { dir, server, env } = await setup();
  try {
    await connectDirect(env, server);
    server.mode = "500";
    await runCli(["hook"], { input: claudeHookInput(), env });
    assert.equal(readQueue(env).length, 1);
    server.mode = "ok";
    const r = await runCli(["disconnect"], { env });
    assert.match(r.stdout, /Disconnected\. This device's token was revoked and deleted\./);
    assert.match(r.stdout, /1 queued receipt\(s\) were deleted/);
    assert.equal(server.revoked, true);
    const revoke = server.requests.at(-1);
    assert.deepEqual(JSON.parse(revoke.raw), { op: "revoke" });
    assert.ok(!existsSync(join(dir, "config", "sync.json")));
    assert.ok(!existsSync(join(dir, "config", "sync-queue.jsonl")));
    const again = await runCli(["disconnect"], { env });
    assert.match(again.stdout, /not connected/);
  } finally {
    await server.close();
  }
});

// -- the token stays in one file -----------------------------------------------------------------------

test("the token appears in sync.json only: not in the queue, state, status, flush or any output", async () => {
  const { dir, server, env } = await setup();
  try {
    const token = await connectDirect(env, server);
    server.mode = "500";
    const outputs = [];
    outputs.push(await runCli(["hook"], { input: claudeHookInput(), env }));
    outputs.push(await runCli(["status"], { env }));
    outputs.push(await runCli(["flush"], { env }));
    for (const o of outputs) {
      assert.ok(!o.stdout.includes(token) && !o.stderr.includes(token));
    }
    for (const f of filesIn(join(dir, "config"))) {
      if (f.endsWith("sync.json")) continue;
      assert.ok(!readFileSync(f, "utf8").includes(token), f);
    }
  } finally {
    await server.close();
  }
});

// -- other producers ------------------------------------------------------------------------------------

test("usage and chat-completion queue under host other, ollama under host ollama", async () => {
  const { server, env } = await setup();
  try {
    await connectDirect(env, server);
    const u = await runCli(["usage", "--provider", "Example", "--model", "example-model", "--input", "1200", "--output", "80", "--cached", "400"], { env });
    assert.match(u.stdout, /this response {3}/);
    const body = JSON.parse(server.requests.at(-1).raw);
    assert.equal(body.client.host, "other");
    assert.equal(body.receipts[0].tokensIn, 1200);
    assert.equal(body.receipts[0].cacheReadTokens, 400);
    assert.equal(body.receipts[0].tokensOut, 80);
    assert.equal(body.receipts[0].provider, "example");
    assert.equal(receiptProblem(body.receipts[0], Date.now()), null);

    const file = fixture("ollama-stream.ndjson");
    const c = await runCli(["chat-completion", file, "--provider", "Ollama"], { env });
    assert.match(c.stdout, /^this response {3}.* Wh - /m);
    assert.equal(JSON.parse(server.requests.at(-1).raw).receipts[0].tokensIn, 28);
  } finally {
    await server.close();
  }
});

test("AIEDS_RECEIPT_LOG_FORMAT=rk-receipts writes one allowlisted receipt per response", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir, { AIEDS_RECEIPT_LOG: join(dir, "receipts.jsonl"), AIEDS_RECEIPT_LOG_FORMAT: "rk-receipts" });
  await runCli(["hook"], { input: claudeHookInput(), env });
  await runCli(["hook"], { input: claudeHookInput(), env });
  const lines = readFileSync(join(dir, "receipts.jsonl"), "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  const a = JSON.parse(lines[0]);
  assert.equal(receiptProblem(a, Date.now()), null);
  assert.equal(JSON.parse(lines[1]).rid, a.rid, "the same response has the same rid");
  assert.ok(!("session" in a));
  assert.ok(!existsSync(join(dir, "config", "sync.json")), "the log needs no connection");
});

test("receipt --format rk-receipts prints every response of a transcript as a receipts file", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  const r = await runCli(["receipt", "--transcript", CLAUDE_FIXTURE, "--format", "rk-receipts"], { env });
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 2);
  // The fixture's own response times are 2026-01-01; judge them as of the day they were captured.
  for (const l of lines) assert.equal(receiptProblem(JSON.parse(l), Date.parse("2026-10-20T15:00:00Z")), null);
});

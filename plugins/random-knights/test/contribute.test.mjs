// `aieds contribute on | off | status | preview | submit | delete`, end to end
// against a local fake of the community backend: default OFF, the consent
// prompt, the --yes rules, the device-code sign-in, preview == request body,
// delete before off, error sentences, and that the token is never printed.
// The real staging backend is not exercised here (see the PR description).
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { runContribute } from "../scripts/contribute.mjs";
import { CONSENT_TEXT_SHA256, loadContribute, queueEntries, readCQueue } from "../scripts/contributeflow.mjs";
import { paths } from "../scripts/store.mjs";
import { COMMUNITY_TOKEN, startCommunityServer } from "./community-server.mjs";
import { NOW, mkIo, resp, spyFetch, turnOnDirect } from "./contribute-helpers.mjs";
import { CANARY, fixture, hermeticEnv, runCli, startFakeServer, tmpDir } from "./helpers.mjs";

const CONSENT = readFileSync(new URL("../consent-contribute.txt", import.meta.url), "utf8");

function envFor(server) {
  return { AIEDS_CONFIG_DIR: join(tmpDir(), "cfg"), AIEDS_CONTRIBUTE: "", AIEDS_COMMUNITY_URL: server?.base ?? "", CI: "" };
}

function allFilesText(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isFile()) out.push([p, readFileSync(p, "utf8")]);
  }
  return out;
}

async function run(args, { stdin = "", isTTY = true, env, fetchImpl } = {}) {
  const t = mkIo({ stdin, isTTY, env, fetchImpl });
  const code = await runContribute(args, t.io);
  return { code, out: t.out(), err: t.err() };
}

// -- default OFF -------------------------------------------------------------------------------

test("default OFF: a fresh install makes zero network calls and writes no file, whatever the command", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    const fetchImpl = spyFetch();
    for (const args of [["status"], ["preview"], ["submit"], ["off"], ["delete"], ["help"], []]) {
      await run(args, { env, fetchImpl });
    }
    assert.equal(fetchImpl.calls.length, 0);
    assert.equal(server.requests.length, 0);
    assert.ok(!existsSync(paths(env).dir), "no config folder");
  } finally {
    await server.close();
  }
});

test("default OFF (real processes): status, preview, a hook and an unknown command never reach the server", async () => {
  const server = await startCommunityServer();
  try {
    const dir = tmpDir();
    const env = hermeticEnv(dir, { AIEDS_CONTRIBUTE: "", AIEDS_COMMUNITY_URL: server.base, CI: "" });
    const s = await runCli(["contribute", "status"], { env });
    assert.equal(s.code, 0);
    assert.match(s.stdout, /Contributing: OFF/);
    const p = await runCli(["contribute", "preview"], { env });
    assert.equal(p.code, 0);
    assert.equal(p.stdout, "");
    const hook = await runCli(["hook"], {
      env,
      input: JSON.stringify({ session_id: "00000000-0000-4000-8000-000000000001", transcript_path: fixture("session-tool-turns.jsonl"), hook_event_name: "Stop" }),
    });
    assert.match(hook.stdout, /this response {3}/);
    const bad = await runCli(["contribute", "nope"], { env });
    assert.equal(bad.code, 2);
    assert.equal(server.requests.length, 0);
    // The hook keeps the local account total and nothing else: no contribute
    // token, queue or state file.
    assert.deepEqual(readdirSync(join(dir, "config")), ["account-total.json"], "nothing else was written");
  } finally {
    await server.close();
  }
});

// -- on: consent --------------------------------------------------------------------------------

test("on: prints the approved consent text byte for byte, then asks, before any network call", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    const fetchImpl = spyFetch();
    const r = await run(["on"], { stdin: "n\n", env, fetchImpl });
    assert.equal(r.out, `${CONSENT}Not turned on.\n`);
    assert.equal(r.code, 0);
    assert.equal(fetchImpl.calls.length, 0);
    assert.equal(server.requests.length, 0);
    assert.ok(CONSENT.endsWith("Turn on contributing? [y/N]\n"));
  } finally {
    await server.close();
  }
});

for (const [label, stdin] of [["n", "n\n"], ["no", "no\n"], ["empty", "\n"], ["EOF", null], ["junk", "maybe\n"], ["yes with a typo", "yess\n"], ["a path", "/etc/passwd\n"]]) {
  test(`on: answering ${label} does not enable and makes no network call`, async () => {
    const server = await startCommunityServer();
    try {
      const env = envFor(server);
      const r = await run(["on"], { stdin, env });
      assert.equal(r.code, 0);
      assert.match(r.out, /Not turned on\.\n$/);
      assert.equal(loadContribute(env), undefined);
      assert.ok(!existsSync(paths(env).dir));
      assert.equal(server.requests.length, 0);
    } finally {
      await server.close();
    }
  });
}

test("on: needs a terminal; without one it exits 2 and sends nothing", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    const r = await run(["on"], { stdin: "y\n", isTTY: false, env });
    assert.equal(r.code, 2);
    assert.match(r.err, /Run this in a terminal, or use --yes on your own machine\./);
    assert.equal(r.out, "");
    // And as a real process with piped stdin: "y" is not enough.
    const dir = tmpDir();
    const child = await runCli(["contribute", "on"], { input: "y\n", env: hermeticEnv(dir, { AIEDS_COMMUNITY_URL: server.base, AIEDS_CONTRIBUTE: "", CI: "" }) });
    assert.equal(child.code, 2);
    assert.match(child.stderr, /Run this in a terminal/);
    assert.equal(server.requests.length, 0);
    assert.ok(!existsSync(join(dir, "config")));
  } finally {
    await server.close();
  }
});

test("on --yes: refused without the own-machine flag, with CI set, and without a terminal", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    const noFlag = await run(["on", "--yes"], { env });
    assert.equal(noFlag.code, 2);
    assert.match(noFlag.err, /--i-am-the-owner-of-this-machine/);
    const ci = await run(["on", "--yes", "--i-am-the-owner-of-this-machine"], { env: { ...env, CI: "true" } });
    assert.equal(ci.code, 2);
    assert.match(ci.err, /CI/);
    const noTty = await run(["on", "--yes", "--i-am-the-owner-of-this-machine"], { env, isTTY: false });
    assert.equal(noTty.code, 2);
    assert.match(noTty.err, /not a terminal/);
    for (const r of [noFlag, ci, noTty]) assert.equal(r.out, "", "the consent text is not printed on a refusal");
    assert.equal(server.requests.length, 0);
    assert.equal(loadContribute(env), undefined);
  } finally {
    await server.close();
  }
});

test("on --yes with the flag in a terminal: still prints the full text and still needs the browser approval", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.pollsBeforeApproval = 2;
    const r = await run(["on", "--yes", "--i-am-the-owner-of-this-machine"], { env });
    assert.equal(r.code, 0);
    assert.ok(r.out.startsWith(CONSENT));
    assert.match(r.out, /Open this link/);
    assert.ok(server.polls >= 3, "it waited for the approval");
    assert.ok(loadContribute(env)?.enabled);
  } finally {
    await server.close();
  }
});

test("on: AIEDS_CONTRIBUTE=off makes no call and turns nothing on", async () => {
  const server = await startCommunityServer();
  try {
    const env = { ...envFor(server), AIEDS_CONTRIBUTE: "off" };
    const r = await run(["on"], { stdin: "y\n", env });
    assert.equal(r.code, 1);
    assert.match(r.out, /AIEDS_CONTRIBUTE is off/);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

// -- on: sign-in ---------------------------------------------------------------------------------

test("on: device-code sign-in prints link and code, stores the token 0600, and never prints it", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    const r = await run(["on"], { stdin: "y\n", env });
    assert.equal(r.code, 0);
    assert.match(r.out, new RegExp(`${server.base.replace(/[.]/g, "[.]")}/contribute/\\?code=KNGT-7QMP`));
    assert.match(r.out, /Code: KNGT-7QMP/);
    assert.match(r.out, /Contributing is ON\. Stop any time: aieds contribute off\./);
    assert.ok(!(r.out + r.err).includes(COMMUNITY_TOKEN));
    assert.ok(!(r.out + r.err).includes("rkc_"));
    assert.deepEqual(server.calls.slice(0, 2), ["communityDeviceStart", "communityDevicePoll"]);
    assert.deepEqual(Object.keys(server.lastStart).sort(), ["client", "clientVersion", "deviceLabel"]);
    assert.match(server.lastStart.deviceLabel, /^[A-Za-z0-9 ._()-]{1,60}$/);
    const conn = loadContribute(env);
    assert.equal(conn.token, COMMUNITY_TOKEN);
    assert.equal(conn.consentVersion, 1);
    assert.equal(conn.endpoint, server.base);
    if (process.platform !== "win32") assert.equal(statSync(paths(env).contribute).mode & 0o777, 0o600);
    assert.ok(!existsSync(paths(env).sync), "sync.json is a different file");
  } finally {
    await server.close();
  }
});

test("on: the device label is generic, never the computer's name", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    await run(["on"], { stdin: "y\n", env });
    const { hostname } = await import("node:os");
    assert.ok(!server.lastStart.deviceLabel.toLowerCase().includes(hostname().toLowerCase()) || hostname().length < 4);
    assert.match(server.lastStart.deviceLabel, / device$/);
  } finally {
    await server.close();
  }
});

test("on: denied, a 404 from production, and an unreachable service each end in one sentence and exit 1", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.pollMode = "denied";
    const denied = await run(["on"], { stdin: "y\n", env });
    assert.equal(denied.code, 1);
    assert.match(denied.out, /The request was denied\. Nothing was turned on\.\n$/);
    assert.equal(loadContribute(env), undefined);

    server.startMode = "404";
    const notYet = await run(["on"], { stdin: "y\n", env });
    assert.equal(notYet.code, 1);
    assert.match(notYet.out, /Community totals are not available yet\.\n$/);

    await server.close();
    const gone = await run(["on"], { stdin: "y\n", env });
    assert.equal(gone.code, 1);
    assert.match(gone.out, /Could not reach the community service/);
    assert.equal(loadContribute(env), undefined);
  } finally {
    await server.close();
  }
});

test("on: when already ON it prints the status and stops", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    turnOnDirect(env, server.base);
    const r = await run(["on"], { stdin: "y\n", env });
    assert.equal(r.code, 0);
    assert.match(r.out, /already ON/);
    assert.match(r.out, /Contributing: ON/);
    assert.ok(!r.out.includes(CONSENT));
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

// -- preview == request body ------------------------------------------------------------------------

test("preview prints exactly the body submit sends, byte for byte, and sends nothing", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.tokenLive = true;
    turnOnDirect(env, server.base);
    queueEntries([resp(1), resp(2, { model: "gpt-5", provider: "openai", host: "codex" })], { env, nowMs: NOW });
    const p = await run(["preview"], { env });
    assert.equal(p.code, 0);
    assert.equal(server.requests.length, 0, "preview sent nothing");
    assert.match(p.err, /Nothing was sent\./);
    const pretty = await run(["preview", "--pretty"], { env });
    const s = await run(["submit"], { env });
    assert.equal(s.code, 0);
    assert.equal(server.requests.length, 1);
    assert.equal(p.out, `${server.requests[0].raw}\n`);
    assert.equal(JSON.parse(server.requests[0].raw).buckets.length, 2);
    assert.deepEqual(JSON.parse(pretty.out), JSON.parse(server.requests[0].raw), "--pretty is the same data, indented");
  } finally {
    await server.close();
  }
});

test("preview works when OFF, from a real transcript, and shows only allowlisted fields", async () => {
  const env = envFor(null);
  const fetchImpl = spyFetch();
  const t = mkIo({ env, fetchImpl, nowMs: Date.parse("2026-01-02T12:00:00Z") });
  const code = await runContribute(["preview", "--transcript", fixture("session-tool-turns.jsonl")], t.io);
  assert.equal(code, 0);
  assert.equal(fetchImpl.calls.length, 0);
  const body = JSON.parse(t.out());
  assert.ok(body.buckets.length >= 1);
  const allowed = new Set(["schema", "day", "provider", "model", "host", "tokenSource", "responses", "tokensIn", "tokensOut", "cacheReadTokens", "cacheWriteTokens", "aiedsModelVersion", "aiedsVersion", "energyWh", "carbonG", "waterL", "treeTimeMin"]);
  for (const b of body.buckets) for (const k of Object.keys(b)) assert.ok(allowed.has(k), k);
  assert.ok(!t.out().includes("CANARY_PROMPT"), "no prompt text");
  assert.ok(!t.out().includes("00000000-0000-4000"), "no session id");
  assert.match(t.err(), /Nothing was sent\./);
  assert.ok(!existsSync(paths(env).dir));
});

// -- the hook ------------------------------------------------------------------------------------------

test("hook: with contributing ON it queues the day's numbers locally (no time of day, no prompt) and sends nothing for today", async () => {
  const server = await startCommunityServer();
  try {
    const dir = tmpDir();
    const env = hermeticEnv(dir, { AIEDS_CONTRIBUTE: "", AIEDS_COMMUNITY_URL: server.base, CI: "" });
    server.tokenLive = true;
    turnOnDirect(env, server.base);
    const input = JSON.stringify({ session_id: "00000000-0000-4000-8000-000000000001", transcript_path: fixture("session-tool-turns.jsonl"), hook_event_name: "Stop" });
    const h = await runCli(["hook"], { input, env });
    assert.match(h.stdout, /this response {3}/);
    assert.equal(server.requests.length, 0, "today is not sent until it closes");
    const q = readCQueue(env);
    assert.ok(q.length >= 1);
    assert.equal(q[0].day, new Date().toISOString().slice(0, 10));
    const queueText = readFileSync(paths(env).contributeQueue, "utf8");
    assert.ok(!/\d{2}:\d{2}:\d{2}/.test(queueText));
    assert.ok(!queueText.includes("CANARY"));
    assert.ok(!queueText.includes("00000000-0000-4000"));
    // Replaying the same response does not queue it twice.
    const before = q.length;
    await runCli(["hook"], { input, env });
    assert.equal(readCQueue(env).length, before);
    // AIEDS_CONTRIBUTE=off: the receipt prints, nothing is queued.
    const dir2 = tmpDir();
    const env2 = hermeticEnv(dir2, { AIEDS_CONTRIBUTE: "off", AIEDS_COMMUNITY_URL: server.base, CI: "" });
    turnOnDirect(env2, server.base);
    const off = await runCli(["hook"], { input, env: env2 });
    assert.match(off.stdout, /this response {3}/);
    assert.ok(!existsSync(paths(env2).contributeQueue));
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("hook: contributing does not touch the sync path (no sync.json, no sync call)", async () => {
  const syncServer = await startFakeServer();
  const server = await startCommunityServer();
  try {
    const dir = tmpDir();
    const env = hermeticEnv(dir, { AIEDS_CONTRIBUTE: "", AIEDS_SYNC_ENDPOINT: syncServer.base, CI: "" });
    turnOnDirect(env, server.base);
    const input = JSON.stringify({ session_id: "00000000-0000-4000-8000-000000000001", transcript_path: fixture("session-tool-turns.jsonl"), hook_event_name: "Stop" });
    await runCli(["hook"], { input, env });
    assert.equal(syncServer.requests.length, 0);
    assert.ok(!existsSync(paths(env).sync));
    assert.ok(!existsSync(paths(env).queue));
  } finally {
    await syncServer.close();
    await server.close();
  }
});

// -- status ------------------------------------------------------------------------------------------------

test("status: ON prints local facts and the service's answer, and never the token", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.tokenLive = true;
    turnOnDirect(env, server.base);
    queueEntries([resp(1)], { env, nowMs: NOW });
    const r = await run(["status"], { env });
    assert.equal(r.code, 0);
    assert.match(r.out, /Contributing: ON/);
    assert.match(r.out, /Consent version 1, given 2026-10-21/);
    assert.match(r.out, /1 responses over 1 day\(s\); 1 closed day\(s\) ready/);
    assert.match(r.out, /consent is current, last upload day 2026-10-20, 3 summaries held this month/);
    assert.match(r.out, /Run `aieds contribute preview`/);
    assert.ok(!r.out.includes(COMMUNITY_TOKEN));
    assert.ok(r.out.includes(paths(env).contribute));
    assert.deepEqual(server.calls, ["communityStatus"]);
    assert.equal(server.requests[0].raw, "{}");
  } finally {
    await server.close();
  }
});

test("status: a service problem is one plain sentence and a non-zero exit", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.tokenLive = true;
    turnOnDirect(env, server.base);
    server.statusMode = "500";
    const r = await run(["status"], { env });
    assert.equal(r.code, 1);
    assert.match(r.out, /The community service had a problem\. Try again later\.\n$/);
    await server.close();
    const gone = await run(["status"], { env });
    assert.equal(gone.code, 1);
    assert.match(gone.out, /Could not reach the community service/);
  } finally {
    await server.close();
  }
});

// -- off, delete and their order ------------------------------------------------------------------------------

test("off: tells the service, removes the token file and the queue, and says what stays", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.tokenLive = true;
    turnOnDirect(env, server.base);
    queueEntries([resp(1)], { env, nowMs: NOW });
    const r = await run(["off"], { env });
    assert.equal(r.code, 0);
    assert.deepEqual(server.calls, ["communityWithdraw"]);
    assert.equal(server.requests[0].raw, JSON.stringify({ op: "off" }));
    assert.equal(server.tokenLive, false);
    assert.match(r.out, /Contributing is OFF\./);
    assert.match(r.out, /cannot be taken out/);
    assert.match(r.out, /aieds contribute delete/);
    assert.deepEqual(readdirSync(paths(env).dir), [], "no contribute file is left");
  } finally {
    await server.close();
  }
});

test("off offline: sending stops at once, the queue is deleted, the withdrawal is pending and retried by the next off", async () => {
  const dead = await startCommunityServer();
  const live = await startCommunityServer();
  try {
    const env = envFor(dead);
    turnOnDirect(env, dead.base);
    queueEntries([resp(1)], { env, nowMs: NOW });
    await dead.close();
    const r = await run(["off"], { env });
    assert.equal(r.code, 1);
    assert.match(r.out, /OFF on this computer: nothing more will be sent\./);
    assert.match(r.out, /Withdraw pending/);
    const conn = loadContribute(env);
    assert.equal(conn.enabled, false);
    assert.equal(conn.withdrawPending, true);
    assert.ok(!existsSync(paths(env).contributeQueue));
    const st = await run(["status"], { env });
    assert.match(st.out, /Contributing: OFF/);
    assert.match(st.out, /Withdraw pending/);
    assert.equal(st.code, 0);
    // Nothing is sent while it is pending off.
    const sub = await run(["submit"], { env });
    assert.match(sub.out, /OFF, so nothing is sent/);
    // Back online (the same token, a live service): the next off finishes it.
    live.tokenLive = true;
    turnOnDirect(env, live.base, { enabled: false, withdrawPending: true });
    const again = await run(["off"], { env });
    assert.equal(again.code, 0);
    assert.deepEqual(live.calls, ["communityWithdraw"]);
    assert.equal(loadContribute(env), undefined);
  } finally {
    await dead.close();
    await live.close();
  }
});

test("delete runs BEFORE off: with --delete the service sees delete, then withdraw; the help says so", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.tokenLive = true;
    turnOnDirect(env, server.base);
    const r = await run(["off", "--delete"], { env });
    assert.equal(r.code, 0);
    assert.deepEqual(server.calls, ["communityDelete", "communityWithdraw"]);
    assert.match(r.out, /Deleted 4 daily summaries and 1 month records/);
    assert.equal(loadContribute(env), undefined);
    const help = await run(["help"], {});
    assert.match(help.out, /delete first, then off/);
    assert.match(help.out, /`off` removes the token that\n`delete` needs/);
  } finally {
    await server.close();
  }
});

test("delete after off cannot reach the service (no token): it says so and exits 1", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.tokenLive = true;
    turnOnDirect(env, server.base);
    await run(["off"], { env });
    server.calls.length = 0;
    const r = await run(["delete", "--yes"], { env });
    assert.equal(r.code, 1);
    assert.match(r.out, /Not deleted\./);
    assert.deepEqual(server.calls, []);
  } finally {
    await server.close();
  }
});

test("delete: asks [y/N] first (n and EOF delete nothing), sends {} or {forget:true}, and says what cannot be removed", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    server.tokenLive = true;
    turnOnDirect(env, server.base);
    queueEntries([resp(1)], { env, nowMs: NOW });
    for (const stdin of ["n\n", "\n", null]) {
      const no = await run(["delete"], { stdin, env });
      assert.equal(no.code, 0);
      assert.match(no.out, /Not deleted\.\n$/);
    }
    assert.equal(server.requests.length, 0);

    const plain = await run(["delete"], { stdin: "y\n", env });
    assert.equal(plain.code, 0);
    assert.equal(server.requests[0].raw, "{}");
    assert.match(plain.out, /Numbers already combined into a monthly total cannot be taken out, because the total no longer holds anything that points to you\./);
    assert.ok(loadContribute(env)?.enabled, "delete alone leaves contributing ON");
    assert.equal(readCQueue(env).length, 0, "the unsent queue is deleted too");

    const forget = await run(["delete", "--forget"], { stdin: "y\n", env });
    assert.equal(forget.code, 0);
    assert.equal(server.requests[1].raw, JSON.stringify({ forget: true }));
    assert.equal(loadContribute(env), undefined, "--forget turns contributing off");
    assert.match(forget.out, /Contributing is OFF\./);
  } finally {
    await server.close();
  }
});

test("delete offline: not deleted, exit 1, nothing local is removed", async () => {
  const server = await startCommunityServer();
  const env = envFor(server);
  turnOnDirect(env, server.base);
  queueEntries([resp(1)], { env, nowMs: NOW });
  await server.close();
  const r = await run(["delete", "--yes"], { env });
  assert.equal(r.code, 1);
  assert.match(r.out, /Not deleted\. Try again online\./);
  assert.ok(loadContribute(env)?.enabled);
  assert.equal(readCQueue(env).length, 1);
});

// -- the token is never shown -------------------------------------------------------------------------------------

test("the token never appears in any output, any file but contribute.json, or any argv, across a whole session", async () => {
  const server = await startCommunityServer();
  try {
    const env = envFor(server);
    const seen = [];
    const keep = (r) => seen.push(r.out, r.err);
    keep(await run(["on"], { stdin: "y\n", env }));
    queueEntries([resp(1)], { env, nowMs: NOW });
    keep(await run(["status"], { env }));
    keep(await run(["preview"], { env }));
    server.mode = "500";
    keep(await run(["submit"], { env }));
    server.mode = "consent";
    keep(await run(["submit"], { env }));
    server.mode = "ok";
    keep(await run(["submit"], { env }));
    keep(await run(["delete", "--yes"], { env }));
    for (const text of seen) {
      assert.ok(!text.includes(COMMUNITY_TOKEN));
      assert.ok(!/rkc_[A-Za-z0-9]/.test(text));
      assert.ok(!text.includes(CANARY));
    }
    for (const [path, text] of allFilesText(paths(env).dir)) {
      if (path === paths(env).contribute) continue;
      assert.ok(!text.includes("rkc_"), path);
    }
    // The server only ever saw the token in the Authorization header.
    for (const rq of server.requests) assert.ok(!rq.raw.includes(COMMUNITY_TOKEN));
    // argv: no command takes a token, so a token-looking argument is just an unknown flag.
    const dirty = await run(["status", COMMUNITY_TOKEN], { env });
    assert.ok(!dirty.out.includes(COMMUNITY_TOKEN));
  } finally {
    await server.close();
  }
});

test("the consent text digest the CLI pins is the one in the consent test", () => {
  assert.equal(CONSENT_TEXT_SHA256, "211a454a8ed56f1fd4a664bdd58f6b5cc8da7b9aeff809c052f5585295091f32");
});

// The non-interactive half of `aieds contribute`: the daily buckets, the
// allowlist, the local queue, the sender and its error mapping, against a local
// fake of the community backend (test/community-server.mjs).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  BUCKET_FIELD_NAMES,
  CONSENT_TEXT_SHA256,
  buildUploads,
  bucketProblem,
  callApi,
  chooseEndpoint,
  consentText,
  contributeActive,
  contributeDisabled,
  loadContribute,
  loadCState,
  maybeSubmitDaily,
  plainProblem,
  PRODUCTION_ENDPOINT,
  queueEntries,
  readCQueue,
  STAGING_ENDPOINT,
  submitQueue,
} from "../scripts/contributeflow.mjs";
import { paths } from "../scripts/store.mjs";
import { COMMUNITY_TOKEN, startCommunityServer } from "./community-server.mjs";
import { NOW, YESTERDAY_MS, resp, spyFetch, turnOnDirect } from "./contribute-helpers.mjs";
import { CANARY, POSIX_HOME, tmpDir } from "./helpers.mjs";

const DAY = 24 * 60 * 60 * 1000;

function hermetic() {
  return { AIEDS_CONFIG_DIR: join(tmpDir(), "cfg"), AIEDS_CONTRIBUTE: "" };
}

async function onServer(mode = "ok") {
  const server = await startCommunityServer();
  server.mode = mode;
  server.tokenLive = true;
  const env = hermetic();
  turnOnDirect(env, server.base);
  return { server, env };
}

test("the consent text on disk is the one this client pins, and the printed bytes are the file's", () => {
  const text = consentText();
  assert.equal(createHash("sha256").update(text).digest("hex"), CONSENT_TEXT_SHA256);
  assert.equal(text, readFileSync(new URL("../consent-contribute.txt", import.meta.url), "utf8"));
});

test("default OFF: nothing is active, queued, written or sent without contribute.json", async () => {
  const env = hermetic();
  const fetchImpl = spyFetch();
  assert.equal(contributeActive(env), false);
  assert.equal(loadContribute(env), undefined);
  assert.deepEqual(queueEntries([resp(1)], { env, nowMs: NOW }), { queued: 0, invalid: 0, dropped: 0 });
  assert.equal((await submitQueue({ env, fetchImpl, nowMs: NOW })).state, "not-on");
  assert.equal(await maybeSubmitDaily({ env, fetchImpl, nowMs: NOW }), undefined);
  assert.equal(fetchImpl.calls.length, 0);
  assert.ok(!existsSync(paths(env).dir), "no config folder was created");
});

test("AIEDS_CONTRIBUTE=off blocks every network call and the queue", async () => {
  const { server, env } = await onServer();
  try {
    queueEntries([resp(1)], { env, nowMs: NOW });
    assert.equal(readCQueue(env).length, 1);
    const off = { ...env, AIEDS_CONTRIBUTE: "off" };
    assert.equal(contributeDisabled(off), true);
    assert.equal(contributeActive(off), false);
    assert.equal((await submitQueue({ env: off, nowMs: NOW })).state, "off");
    assert.equal(queueEntries([resp(2)], { env: off, nowMs: NOW }).queued, 0);
    const r = await callApi("communityStatus", {}, { endpoint: server.base, token: COMMUNITY_TOKEN, env: off });
    assert.equal(r.blocked, true);
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

test("endpoint choice: production by default, --staging or the env var for staging, AIEDS_COMMUNITY_URL wins", () => {
  assert.equal(chooseEndpoint([], {}), PRODUCTION_ENDPOINT);
  assert.match(PRODUCTION_ENDPOINT, /randomknights-xyz/);
  assert.equal(chooseEndpoint(["--staging"], {}), STAGING_ENDPOINT);
  assert.match(STAGING_ENDPOINT, /randomknights-abc/);
  assert.equal(chooseEndpoint([], { AIEDS_COMMUNITY_STAGING: "1" }), STAGING_ENDPOINT);
  assert.equal(chooseEndpoint(["--staging"], { AIEDS_COMMUNITY_URL: "http://127.0.0.1:9/" }), "http://127.0.0.1:9");
});

// -- buckets --------------------------------------------------------------------------------

test("buckets: one per day, provider, model, tool and token source; sums; reported and estimated never mix", () => {
  const env = hermetic();
  turnOnDirect(env, "http://127.0.0.1:9");
  queueEntries(
    [
      resp(1),
      resp(2, { tokensIn: 2000, tokensOut: 300, energyWh: 0.8, waterMl: 4 }),
      resp(3, { tokenSource: "estimated" }),
      resp(4, { model: "gpt-5", provider: "openai", host: "codex" }),
    ],
    { env, nowMs: NOW },
  );
  const up = buildUploads(readCQueue(env), { nowMs: NOW });
  assert.equal(up.batches.length, 1);
  const buckets = up.batches[0].buckets;
  assert.equal(buckets.length, 3);
  const reported = buckets.find((b) => b.model === "claude-sonnet-5-5" && b.tokenSource === "reported");
  assert.equal(reported.responses, 2);
  assert.equal(reported.tokensIn, 3000);
  assert.equal(reported.tokensOut, 500);
  assert.equal(reported.cacheReadTokens, 1200);
  assert.equal(reported.energyWh, 1.2);
  assert.equal(reported.waterL, 0.006);
  assert.equal(reported.day, "2026-10-20");
  assert.ok(buckets.find((b) => b.tokenSource === "estimated" && b.responses === 1));
  assert.equal(buckets.find((b) => b.model === "gpt-5").host, "codex");
});

test("buckets: only closed days, at most 7 days old; today waits, older days expire", () => {
  const env = hermetic();
  turnOnDirect(env, "http://127.0.0.1:9");
  queueEntries(
    [resp(1, { tsMs: NOW - 3600_000 }), resp(2), resp(3, { tsMs: NOW - 7 * DAY }), resp(4, { tsMs: NOW - 9 * DAY })],
    { env, nowMs: NOW },
  );
  const up = buildUploads(readCQueue(env), { nowMs: NOW });
  assert.equal(up.open, 1);
  assert.equal(up.expiredRids.size, 1);
  assert.deepEqual(up.batches[0].buckets.map((b) => b.day).sort(), ["2026-10-14", "2026-10-20"]);
  const withToday = buildUploads(readCQueue(env), { nowMs: NOW, includeToday: true });
  assert.equal(withToday.open, 0);
});

test("buckets: caps clamp and are reported as withheld", () => {
  const entries = [];
  for (let i = 1; i <= 5003; i += 1) {
    entries.push({
      rid: i.toString(16).padStart(32, "0"), day: "2026-10-20", host: "claude", provider: "anthropic",
      model: "m", tokenSource: "reported", aiedsModelVersion: "v2", tokensIn: 100_000, tokensOut: 1,
      cacheReadTokens: 0, cacheWriteTokens: 0, energyWh: 0.1, carbonG: 0.01, waterMl: 0, treeTimeMin: 1,
    });
  }
  const up = buildUploads(entries, { nowMs: NOW });
  const b = up.batches[0].buckets[0];
  assert.equal(b.responses, 5000);
  assert.equal(b.tokensIn, 50_000_000);
  assert.equal(up.withheld.responses, 3);
  assert.ok(up.withheld.tokens > 0);
  assert.equal(bucketProblem(b), null);
});

test("buckets: more than 50 go in batches of 50", () => {
  const entries = [];
  for (let i = 1; i <= 51; i += 1) {
    entries.push({
      rid: i.toString(16).padStart(32, "0"), day: "2026-10-20", host: "claude", provider: "anthropic",
      model: `model-${i}`, tokenSource: "reported", aiedsModelVersion: "v2", tokensIn: 10, tokensOut: 1,
      cacheReadTokens: 0, cacheWriteTokens: 0, energyWh: 0.01, carbonG: 0.001, waterMl: 0, treeTimeMin: 0,
    });
  }
  const up = buildUploads(entries, { nowMs: NOW });
  assert.deepEqual(up.batches.map((b) => b.buckets.length), [50, 1]);
});

test("allowlist: a bucket carries only the listed fields, and unknown keys, paths and sentences fail the local check", () => {
  const env = hermetic();
  turnOnDirect(env, "http://127.0.0.1:9");
  queueEntries([resp(1)], { env, nowMs: NOW });
  const b = buildUploads(readCQueue(env), { nowMs: NOW }).batches[0].buckets[0];
  for (const k of Object.keys(b)) assert.ok(BUCKET_FIELD_NAMES.includes(k), k);
  assert.deepEqual(Object.keys(b), [
    "schema", "day", "provider", "model", "host", "tokenSource", "responses", "tokensIn", "tokensOut",
    "cacheReadTokens", "cacheWriteTokens", "aiedsModelVersion", "aiedsVersion", "energyWh", "carbonG",
    "waterL", "treeTimeMin",
  ]);
  assert.equal(bucketProblem(b), null);
  assert.equal(bucketProblem({ ...b, prompt: CANARY }), "unknown_field:prompt");
  assert.equal(bucketProblem({ ...b, cwd: "x" }), "unknown_field:cwd");
  assert.equal(bucketProblem({ ...b, model: `${POSIX_HOME}x/secret` }), "invalid_model");
  assert.equal(bucketProblem({ ...b, model: "a sentence with spaces" }), "invalid_model");
  assert.equal(bucketProblem({ ...b, day: "2026-13-40" }), "invalid_day");
  assert.equal(bucketProblem({ ...b, host: "my-laptop" }), "invalid_host");
  assert.equal(bucketProblem({ ...b, responses: 0 }), "invalid_responses");
  assert.equal(bucketProblem({ ...b, schema: "rk-community/2" }), "invalid_schema");
  assert.equal(bucketProblem({ ...b, cacheReadTokens: b.tokensIn + 1 }), "invalid_cacheReadTokens");
  const { energyWh, ...rest } = b;
  void energyWh;
  assert.equal(bucketProblem(rest), "missing_energyWh");
});

test("queue: keeps the day, never the time of day or a session; a planted canary never reaches the body", () => {
  const env = hermetic();
  turnOnDirect(env, "http://127.0.0.1:9");
  const e = resp(1);
  // A receipt with an extra field is refused by the same local check the sync client uses.
  const dirty = { host: "claude", receipt: { ...e.receipt, rid: "b".repeat(32), prompt: CANARY } };
  const r = queueEntries([e, dirty, resp(3, { model: `${POSIX_HOME}kit/secret` })], { env, nowMs: NOW });
  assert.equal(r.queued, 1);
  assert.equal(r.invalid, 2);
  const text = readFileSync(paths(env).contributeQueue, "utf8");
  assert.ok(!text.includes(CANARY));
  assert.ok(!/\d{2}:\d{2}:\d{2}/.test(text), "no time of day on disk");
  assert.ok(!text.includes("tsUtc"));
  // A hand-edited line with extra keys is cleaned on read.
  appendFileSync(paths(env).contributeQueue, JSON.stringify({ ...readCQueue(env)[0], rid: "c".repeat(32), prompt: CANARY, cwd: "/x" }) + "\n");
  appendFileSync(paths(env).contributeQueue, "{ torn line\n[1,2]\n");
  const read = readCQueue(env);
  assert.equal(read.length, 2);
  assert.ok(!JSON.stringify(read).includes(CANARY));
  const body = buildUploads(read, { nowMs: NOW }).batches[0].body;
  assert.ok(!body.includes(CANARY));
});

test("queue: a response is queued once, and the queue is bounded with the oldest dropped first", () => {
  const env = hermetic();
  turnOnDirect(env, "http://127.0.0.1:9");
  queueEntries([resp(1), resp(2)], { env, nowMs: NOW });
  assert.equal(queueEntries([resp(2), resp(3)], { env, nowMs: NOW, max: 3 }).queued, 1);
  const r = queueEntries([resp(4), resp(5)], { env, nowMs: NOW, max: 3 });
  assert.equal(r.dropped, 2);
  assert.deepEqual(readCQueue(env).map((e) => e.rid), [3, 4, 5].map((n) => n.toString(16).padStart(32, "0")));
  assert.equal(loadCState(env).dropped, 2);
});

test("files: the token file, queue and state are owner-only where the OS supports it, and only contribute.json holds the token", async () => {
  const { server, env } = await onServer();
  try {
    queueEntries([resp(1)], { env, nowMs: NOW });
    await submitQueue({ env, nowMs: NOW });
    const p = paths(env);
    if (process.platform !== "win32") {
      for (const f of [p.contribute, p.contributeQueue, p.contributeState]) assert.equal(statSync(f).mode & 0o777, 0o600, f);
    }
    for (const f of [p.contributeQueue, p.contributeState]) {
      if (existsSync(f)) assert.ok(!readFileSync(f, "utf8").includes(COMMUNITY_TOKEN), f);
    }
    assert.ok(readFileSync(p.contribute, "utf8").includes(COMMUNITY_TOKEN));
  } finally {
    await server.close();
  }
});

// -- sending ------------------------------------------------------------------------------------

test("submit: closed days go out in one body, are removed from the queue, and the token is only in the header", async () => {
  const { server, env } = await onServer();
  try {
    queueEntries([resp(1), resp(2), resp(3, { tsMs: NOW - 3600_000 })], { env, nowMs: NOW });
    const r = await submitQueue({ env, nowMs: NOW });
    assert.equal(r.state, "done");
    assert.equal(r.buckets, 1);
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].headers.authorization, `Bearer ${COMMUNITY_TOKEN}`);
    assert.ok(!server.requests[0].raw.includes(COMMUNITY_TOKEN));
    assert.equal(server.buckets.length, 1);
    assert.equal(server.buckets[0].responses, 2);
    assert.equal(readCQueue(env).length, 1, "today's response stays");
    const st = loadCState(env);
    assert.equal(st.lastSentDay, "2026-10-21");
    assert.equal(st.lastSentBuckets, 1);
    assert.equal(st.lastSentResponses, 2);
    assert.equal((await submitQueue({ env, nowMs: NOW })).state, "empty");
    assert.equal(server.requests.length, 1);
  } finally {
    await server.close();
  }
});

test("hook daily send: at most one attempt per UTC day, only when a closed day waits", async () => {
  const { server, env } = await onServer();
  try {
    queueEntries([resp(1)], { env, nowMs: NOW });
    const first = await maybeSubmitDaily({ env, nowMs: NOW });
    assert.equal(first.state, "done");
    queueEntries([resp(2, { tsMs: NOW - 2 * DAY })], { env, nowMs: NOW });
    assert.equal(await maybeSubmitDaily({ env, nowMs: NOW + 1000 }), undefined, "second attempt the same day");
    assert.equal(server.requests.length, 1);
    const next = await maybeSubmitDaily({ env, nowMs: NOW + DAY });
    assert.equal(next.state, "done");
    assert.equal(server.requests.length, 2);
  } finally {
    await server.close();
  }
});

test("the hook does not try when only today's numbers wait", async () => {
  const { server, env } = await onServer();
  try {
    queueEntries([resp(1, { tsMs: NOW - 1000 })], { env, nowMs: NOW });
    const r = await maybeSubmitDaily({ env, nowMs: NOW });
    assert.equal(r.state, "empty");
    assert.equal(loadCState(env).lastAttemptDay, "", "no attempt was made, so tomorrow still sends");
    assert.equal(server.requests.length, 0);
  } finally {
    await server.close();
  }
});

const ERRORS = [
  // mode, expected state, calls to communitySubmit, sentence, queue kept
  ["500", "retry", 3, /Could not reach|had a problem/, 1],
  ["503-paused", "paused", 1, /paused right now/, 1],
  ["503-unavailable", "unavailable", 1, /^Community totals are not available yet\.$/, 1],
  ["404", "unavailable", 1, /^Community totals are not available yet\.$/, 1],
  ["429", "retry", 1, /Too many requests/, 1],
  ["consent", "consent", 1, /consent text changed/, 1],
  ["400", "dropped", 1, /refused the request \(invalid_request\)/, 0],
];

for (const [mode, state, submitCalls, sentence, kept] of ERRORS) {
  test(`error mapping: ${mode} -> ${state}, one plain sentence, ${submitCalls} call(s), queue kept ${kept}`, async () => {
    const { server, env } = await onServer(mode);
    try {
      queueEntries([resp(1)], { env, nowMs: NOW });
      const r = await submitQueue({ env, nowMs: NOW, sleepImpl: async () => {} });
      assert.equal(r.state, state);
      assert.equal(server.calls.filter((c) => c === "communitySubmit").length, submitCalls);
      const sentenceOut = plainProblem(r.res);
      assert.match(sentenceOut, sentence);
      assert.ok(!sentenceOut.includes(COMMUNITY_TOKEN));
      assert.equal(readCQueue(env).length, kept);
      assert.ok(loadContribute(env), "the token stays for a recoverable problem");
    } finally {
      await server.close();
    }
  });
}

test("error mapping: a revoked token turns contributing off locally and keeps nothing", async () => {
  const { server, env } = await onServer("revoked");
  try {
    queueEntries([resp(1)], { env, nowMs: NOW });
    const r = await submitQueue({ env, nowMs: NOW });
    assert.equal(r.state, "revoked");
    assert.equal(loadContribute(env), undefined);
    assert.ok(!existsSync(paths(env).contributeQueue));
  } finally {
    await server.close();
  }
});

test("error mapping: no network at all is one sentence, the queue is kept, and the retries stop at two", async () => {
  const env = hermetic();
  turnOnDirect(env, "http://127.0.0.1:9"); // nothing listens on port 9
  queueEntries([resp(1)], { env, nowMs: NOW });
  const fetchImpl = spyFetch();
  const sleeps = [];
  const r = await submitQueue({ env, fetchImpl, nowMs: NOW, sleepImpl: async (ms) => sleeps.push(ms) });
  assert.equal(r.state, "retry");
  assert.equal(fetchImpl.calls.length, 3, "one try and two retries");
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps[1] >= sleeps[0], "backoff grows");
  assert.match(plainProblem(r.res), /Could not reach the community service/);
  assert.equal(readCQueue(env).length, 1);
});

test("rejections: a full ledger keeps the summary for later, a bad value drops it", async () => {
  for (const [mode, kept] of [["reject-ledger", 1], ["reject-bad", 0]]) {
    const { server, env } = await onServer(mode);
    try {
      queueEntries([resp(1)], { env, nowMs: NOW });
      await submitQueue({ env, nowMs: NOW });
      assert.equal(readCQueue(env).length, kept, mode);
    } finally {
      await server.close();
    }
  }
});

test("a slow server cannot hold the sender past its budget, and the queue survives", async () => {
  const { server, env } = await onServer("blackhole");
  try {
    queueEntries([resp(1)], { env, nowMs: NOW });
    const started = Date.now();
    const r = await submitQueue({ env, nowMs: NOW, retries: 0, budgetMs: 700 });
    assert.ok(Date.now() - started < 3000);
    assert.equal(r.state, "retry");
    assert.equal(readCQueue(env).length, 1);
  } finally {
    await server.close();
  }
});

test("the token is never in any message the flow can produce", async () => {
  for (const mode of ["ok", "500", "503-paused", "404", "429", "400", "consent", "revoked"]) {
    const { server, env } = await onServer(mode);
    try {
      queueEntries([resp(1)], { env, nowMs: NOW });
      const r = await submitQueue({ env, nowMs: NOW, sleepImpl: async () => {} });
      const text = JSON.stringify({ ...r, res: undefined }) + plainProblem(r.res ?? { status: 0, body: {} });
      assert.ok(!text.includes(COMMUNITY_TOKEN), mode);
      assert.ok(!text.includes("rkc_"), mode);
      if (existsSync(paths(env).contributeState)) assert.ok(!readFileSync(paths(env).contributeState, "utf8").includes("rkc_"));
    } finally {
      await server.close();
    }
  }
});

test("a token file without an rkc_ token is not a connection", () => {
  const env = hermetic();
  turnOnDirect(env, "http://127.0.0.1:9");
  assert.ok(loadContribute(env));
  writeFileSync(paths(env).contribute, JSON.stringify({ endpoint: "http://127.0.0.1:9", token: "rkd_sync_token_not_mine", enabled: true }));
  assert.equal(loadContribute(env), undefined);
  assert.equal(contributeActive(env), false);
});

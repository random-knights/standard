// GitHub Copilot CLI reader: real numbers from a real 1.0.100 session, the
// per-turn read position, and the proof that message text is never read.
//
// The fixture (copilot-usage-real.jsonl) holds ONLY the numbers of the owner's
// real session: three usage records and the shutdown totals. The conversation
// the real file also holds is not in it. These tests rebuild a realistic events
// file around those numbers, with a canary string planted in every kind of
// event that carries text, and check it never comes out.
import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_LINE_BYTES,
  copilotEventsPath,
  isCopilotEventsPath,
  readCopilotShutdownTotals,
  readCopilotUsage,
} from "../scripts/hosts/copilot.mjs";
import { CANARY, fixtureText, hermeticEnv, runCli, tmpDir, POSIX_HOME } from "./helpers.mjs";

const SESSION = "76271fba-e658-4ec1-8603-e756a8676870";
const real = fixtureText("copilot-usage-real.jsonl").split("\n").filter(Boolean);
const [usage1, usage2, usage3, shutdown] = real;

/** Event lines that carry text, with the canary in each. None of these is parsed. */
const chatter = (kind) =>
  JSON.stringify({ type: kind, data: { content: `${CANARY} ${kind}` }, timestamp: "2026-10-20T14:21:30.000Z" });

const TURN1 = [
  chatter("user.message"),
  chatter("model.messages_snapshot"),
  usage1,
  chatter("assistant.message"),
  chatter("tool.execution_complete"),
  usage2,
  chatter("assistant.message"),
];
const TURN2 = [chatter("user.message"), chatter("model.messages_snapshot"), usage3, chatter("assistant.message")];

function writeEvents(dir, lines) {
  const file = join(dir, "copilot", "session-state", SESSION, "events.jsonl");
  mkdirSync(join(dir, "copilot", "session-state", SESSION), { recursive: true });
  writeFileSync(file, lines.map((l) => `${l}\n`).join(""));
  return file;
}

test("copilot: summed usage records equal the host's own shutdown totals", () => {
  const dir = tmpDir();
  const file = writeEvents(dir, [...TURN1, ...TURN2, shutdown]);
  const read = readCopilotUsage(file, 0);
  assert.equal(read.calls.length, 3);
  const totals = readCopilotShutdownTotals(file)["gpt-6-luna"];
  const plain = (c) => c.usage.input_tokens;
  const cacheRead = (c) => c.usage.cache_read_input_tokens;
  const cacheWrite = (c) => c.usage.cache_creation_input_tokens;
  const sum = (f) => read.calls.reduce((n, c) => n + f(c), 0);
  assert.equal(sum((c) => plain(c) + cacheRead(c) + cacheWrite(c)), totals.inputTokens, "input includes both caches");
  assert.equal(sum((c) => c.usage.output_tokens), totals.outputTokens);
  assert.equal(sum(cacheRead), totals.cacheReadTokens);
  assert.equal(sum(cacheWrite), totals.cacheWriteTokens);
  // And the real numbers themselves: 71,893 in (56,132 cache read, 15,752 cache write), 250 out.
  assert.deepEqual([totals.inputTokens, totals.cacheReadTokens, totals.cacheWriteTokens, totals.outputTokens], [71893, 56132, 15752, 250]);
});

test("copilot: each turn reads only what was appended since the last read", () => {
  const dir = tmpDir();
  const file = writeEvents(dir, TURN1);
  const first = readCopilotUsage(file, 0);
  assert.deepEqual(first.calls.map((c) => c.seq), [1, 2]);
  assert.equal(first.nextPos, readFileSync(file).length, "moves over every complete line");

  const nothing = readCopilotUsage(file, first.nextPos);
  assert.equal(nothing.calls.length, 0);
  assert.equal(nothing.nextPos, first.nextPos);

  appendFileSync(file, TURN2.map((l) => `${l}\n`).join(""));
  const second = readCopilotUsage(file, first.nextPos);
  assert.deepEqual(second.calls.map((c) => c.seq), [3], "the second turn gets its own single receipt input");
});

test("copilot: a half-written last line is left for the next read", () => {
  const dir = tmpDir();
  const file = writeEvents(dir, [chatter("user.message")]);
  appendFileSync(file, usage1.slice(0, 40));
  const torn = readCopilotUsage(file, 0);
  assert.equal(torn.calls.length, 0);
  const stopAt = torn.nextPos;
  appendFileSync(file, `${usage1.slice(40)}\n`);
  const whole = readCopilotUsage(file, stopAt);
  assert.deepEqual(whole.calls.map((c) => c.seq), [1]);
});

test("copilot: a file shorter than the saved position is read again from the start", () => {
  const dir = tmpDir();
  const file = writeEvents(dir, [usage1]);
  const r = readCopilotUsage(file, 10_000_000);
  assert.equal(r.calls.length, 1);
});

test("copilot: message text is never read into a result (canary)", () => {
  const dir = tmpDir();
  // A message that quotes the record type name must not be mistaken for usage.
  const adversarial = JSON.stringify({
    type: "user.message",
    data: { content: `${CANARY} "session.usage_record" {"data":{"usage":{"model":"${CANARY}","inputTokens":9}}}` },
  });
  const fakeUsage = JSON.stringify({ type: "assistant.message", data: { usage: { inputTokens: 1 }, text: `${CANARY} "session.usage_record"` } });
  const file = writeEvents(dir, [adversarial, fakeUsage, ...TURN1]);
  const r = readCopilotUsage(file, 0);
  assert.deepEqual(r.calls.map((c) => c.seq), [1, 2]);
  assert.ok(!JSON.stringify(r).includes("CANARY"));
});

test("copilot: a very long line is skipped unread", () => {
  const dir = tmpDir();
  const huge = JSON.stringify({ type: "session.usage_record", data: { usage: { model: "x", inputTokens: 5, outputTokens: 5 } }, pad: "A".repeat(MAX_LINE_BYTES + 10) });
  const file = writeEvents(dir, [huge, usage1]);
  const r = readCopilotUsage(file, 0);
  assert.deepEqual(r.calls.map((c) => c.seq), [1]);
});

test("copilot: only a session-state/<id>/events.jsonl path is accepted", () => {
  assert.ok(isCopilotEventsPath(`C:\\Users\\a b\\.copilot\\session-state\\${SESSION}\\events.jsonl`));
  assert.ok(isCopilotEventsPath(`${POSIX_HOME}x/.copilot/session-state/${SESSION}/events.jsonl`));
  for (const bad of [
    "C:\\Windows\\win.ini",
    "/etc/passwd",
    `${POSIX_HOME}x/.copilot/session-state/${SESSION}/events.jsonl.bak`,
    `${POSIX_HOME}x/.copilot/other/${SESSION}/events.jsonl`,
    `${POSIX_HOME}x/.copilot/session-state/../events.jsonl`,
    "events.jsonl",
    "",
    42,
    undefined,
  ]) {
    assert.equal(isCopilotEventsPath(bad), false, String(bad));
  }
  assert.equal(copilotEventsPath("../x", {}), undefined);
  assert.ok(copilotEventsPath(SESSION, { COPILOT_HOME: "/tmp/h" }).includes("session-state"));
});

// -- The hook, end to end ---------------------------------------------------------------

const hookInput = (file, extra = {}) =>
  JSON.stringify({ sessionId: SESSION, timestamp: 1, cwd: "C:\\Users\\a b\\proj", transcriptPath: file, stopReason: "end_turn", stop_hook_active: false, ...extra });

test("copilot hook: one receipt per turn, none when nothing is new, no text anywhere", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  const file = writeEvents(dir, TURN1);

  const t1 = await runCli(["hook", "copilot"], { input: hookInput(file), env });
  assert.equal(t1.code, 0);
  assert.match(t1.stdout, /this response {3}/);
  assert.match(t1.stdout, /^tokens {10}47\.4k in \(70% cache read\) - 158 out$/m, "both calls of the turn");
  assert.doesNotMatch(t1.stdout, /Most of this is the session's context/, "the tokens line replaces the context note");

  const again = await runCli(["hook", "copilot"], { input: hookInput(file), env });
  assert.equal(again.stdout, "", "no new usage, no second receipt");

  appendFileSync(file, TURN2.map((l) => `${l}\n`).join(""));
  const t2 = await runCli(["hook", "copilot"], { input: hookInput(file), env });
  assert.match(t2.stdout, /^tokens {10}24\.5k in \(93% cache read\) - 92 out$/m);

  for (const out of [t1.stdout, t1.stderr, t2.stdout, t2.stderr]) assert.ok(!out.includes("CANARY"));
  const marks = readFileSync(join(dir, "config", "copilot-marks.json"), "utf8");
  assert.ok(!marks.includes("CANARY"));
  assert.ok(!marks.includes(SESSION), "the session id is stored only as a hash");
});

test("copilot hook: a hostile transcriptPath reads nothing and exits 0", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  for (const p of ["C:\\Windows\\win.ini", "/etc/passwd", "../../x/events.jsonl"]) {
    const r = await runCli(["hook", "copilot"], { input: hookInput(p), env });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
  }
  const r = await runCli(["hook", "copilot"], { input: "not json", env });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
  assert.ok(!existsSync(join(dir, "config", "sync.json")));
});

test("copilot hook: without transcriptPath it finds the session's own file", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  writeEvents(dir, TURN1);
  const r = await runCli(["hook", "copilot"], { input: JSON.stringify({ sessionId: SESSION }), env });
  assert.match(r.stdout, /this response {3}/);
});

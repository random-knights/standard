// Tests for the Grok Build session reader and the hook path that uses it.
//
// The fixture carries the SHAPE of a real Grok Build 1.0.13 updates.jsonl:
// record types, field names and token counters. Every text value is a CANARY
// marker, so no conversation text is committed, and a canary must never reach
// any output.
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { disclosureFromResponse } from "../vendor/lib/dist/index.js";
import { formatReceipt, parseSession, receiptFor } from "../scripts/core.mjs";
import { scopeLines } from "./helpers.mjs";
import {
  TESTED_HOSTS,
  findHostSession,
  parseGrokSession,
  sniffFormat,
} from "../scripts/hosts.mjs";

// Every child process gets its own config folder, so the local account
// total a receipt writes never lands in the real user config.
const TEST_CONFIG_DIR = mkdtempSync(join(tmpdir(), "rk test config "));
process.on("exit", () => rmSync(TEST_CONFIG_DIR, { recursive: true, force: true }));

/** The receipt the hook should print for a session file's text, as scope lines. */
const expectedScopes = (text) => scopeLines(formatReceipt(receiptFor(parseSession(text))));

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const script = join(pluginRoot, "scripts", "aieds.mjs");
const fixture = (name) => join(here, "fixtures", name);
const fixtureText = (name) => readFileSync(fixture(name), "utf8");
const CANARIES = /CANARY_[A-Z0-9_]+/;

function run(args, input, { env = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, AIEDS_CONFIG_DIR: TEST_CONFIG_DIR, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.write(typeof input === "string" ? input : JSON.stringify(input));
    }
    child.stdin.end();
  });
}

const runHook = (input, opts) => run(["hook"], input, opts);

function tmp() {
  return mkdtempSync(join(tmpdir(), "rk grok test "));
}

function libraryWh(model, inputTokens, outputTokens) {
  return disclosureFromResponse({ provider: "xAI", model, inputTokens, outputTokens }).energyWh;
}

function approx(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} !== ${expected}`,
  );
}

// -- format detection ----------------------------------------------------------

test("sniff: Grok's file and Claude's file are told apart, junk is unknown", () => {
  assert.equal(sniffFormat(fixtureText("grok-updates.jsonl")), "grok");
  assert.equal(sniffFormat(fixtureText("session-tool-turns.jsonl")), "claude");
  assert.equal(sniffFormat(""), "unknown");
  assert.equal(sniffFormat("not json at all\n{broken"), "unknown");
});

test("parseSession: an unrecognized file yields no calls, never throws", () => {
  for (const text of ["", "\n\n", "[1,2,3]", '{"a":1}\n{"b":2}', "\u0000\u0001"]) {
    assert.equal(parseSession(text).calls.length, 0);
  }
});

// -- reader --------------------------------------------------------------------

test("grok: one call per prompt and model, cancelled and duplicate records handled", () => {
  const p = parseGrokSession(fixtureText("grok-updates.jsonl"));
  assert.equal(p.host, "grok");
  assert.deepEqual(
    p.calls.map((c) => [c.id, c.turn, c.count]),
    [
      ["prompt-A:grok-4.6", 1, 2],
      ["prompt-B:grok-4.6", 2, 3],
      ["prompt-B:grok-4.6-mini", 2, 2],
    ],
  );
  assert.equal(p.lastTurn, 2);
});

test("grok: inputTokens is the full prompt, so cached tokens are carved out of it", () => {
  const p = parseGrokSession(fixtureText("grok-updates.jsonl"));
  assert.deepEqual(p.calls[1].usage, {
    input_tokens: 24000 - 16000 - 1000,
    cache_creation_input_tokens: 1000,
    cache_read_input_tokens: 16000,
    output_tokens: 600,
  });
});

test("grok: receipt energy equals the library, and model calls are summed", () => {
  const p = parseSession(fixtureText("grok-updates.jsonl"));
  const r = receiptFor(p);
  approx(
    r.response.energyWh,
    libraryWh("grok-4.6", 24000, 600) + libraryWh("grok-4.6-mini", 6000, 100),
    "response Wh",
  );
  assert.equal(r.session.calls, 2 + 3 + 2);
  assert.equal(r.session.tokens.input, 13366 + 30000);
  assert.equal(r.session.tokens.output, 91 + 700);
});

test("grok: the basis says there is no published figure, not that the model is unlisted", () => {
  const text = formatReceipt(receiptFor(parseGrokSession(fixtureText("grok-updates.jsonl"))));
  assert.match(text, / No published figure for grok-4\.6, grok-4\.6-mini, so a general guess is used\.$/m);
  assert.doesNotMatch(text, /not in table/);
  assert.doesNotMatch(text, CANARIES);
});

test("grok: the session file's text never reaches the parsed result", () => {
  assert.doesNotMatch(JSON.stringify(parseGrokSession(fixtureText("grok-updates.jsonl"))), CANARIES);
});

// -- hook ----------------------------------------------------------------------

test("grok hook: camelCase and snake_case fields both work", async () => {
  const base = {
    hookEventName: "stop",
    sessionId: "00000000-0000-4000-8000-0000000000d1",
    cwd: "CANARY_CWD",
    transcriptPath: fixture("grok-updates.jsonl"),
    promptId: "prompt-B",
    reason: "end_turn",
    stopHookActive: false,
    lastAssistantMessage: "CANARY_REPLY_TEXT_B",
  };
  const camel = await runHook(base);
  assert.equal(camel.code, 0);
  const text = JSON.parse(camel.stdout).systemMessage;
  // prompt-B's 30,000 in and 700 out (see the energy test above) and all seven calls.
  assert.deepEqual(scopeLines(text), expectedScopes(fixtureText("grok-updates.jsonl")));
  assert.doesNotMatch(text, CANARIES);
  assert.match(text, /^A guess, not a measurement\. Cached text counted as free\./m);

  const snake = await runHook({
    hook_event_name: "stop",
    session_id: base.sessionId,
    transcript_path: base.transcriptPath,
    prompt_id: "prompt-B",
    reason: "end_turn",
  });
  assert.equal(JSON.parse(snake.stdout).systemMessage, text);
});

test("grok hook: the session-end Stop (reason shutdown) gets no receipt", async () => {
  for (const reason of ["shutdown", "channel_closed"]) {
    const r = await runHook({
      hookEventName: "stop",
      transcriptPath: fixture("grok-updates.jsonl"),
      reason,
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "", reason);
  }
});

test("grok hook: waits for the turn_completed record of this prompt", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "updates.jsonl");
    const all = fixtureText("grok-updates.jsonl").split("\n").filter(Boolean);
    const upToA = all.filter((l) => !l.includes("prompt-B") && !l.includes("prompt-C"));
    writeFileSync(path, upToA.join("\n") + "\n");
    const late = all.find((l) => l.includes('"eventId":"e6"'));
    setTimeout(() => appendFileSync(path, late + "\n"), 400);
    const r = await runHook({
      hookEventName: "stop",
      transcriptPath: path,
      promptId: "prompt-B",
      reason: "end_turn",
    });
    assert.equal(r.code, 0);
    const got = scopeLines(JSON.parse(r.stdout).systemMessage);
    assert.deepEqual(got, expectedScopes([...upToA, late].join("\n")), "prompt-B is the response");
    assert.notDeepEqual(got, expectedScopes(upToA.join("\n")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("grok hook: a prompt that never lands is silent, not mislabeled", async () => {
  // This is what Grok Build 1.0.13 does on a normal turn: the Stop hook runs
  // before the turn's own turn_completed record is written, so the newest
  // record in the file is the PREVIOUS response. Printing it as "this
  // response" would be wrong, so the hook prints nothing.
  const r = await runHook({
    hookEventName: "stop",
    transcriptPath: fixture("grok-updates.jsonl"),
    promptId: "prompt-NOT-YET-WRITTEN",
    reason: "end_turn",
  });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("grok: a session file in a shape this reader does not know prints nothing", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "updates.jsonl");
    writeFileSync(
      path,
      JSON.stringify({
        method: "session/update",
        params: { update: { sessionUpdate: "turn_completed", usage: { in: 1, out: 2 } } },
      }) + "\n",
    );
    const r = await runHook({ hookEventName: "stop", transcriptPath: path, reason: "end_turn" });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -- on-demand receipt ---------------------------------------------------------

test("grok receipt: --transcript prints the session total from the session file", async () => {
  const r = await run(["receipt", "--transcript", fixture("grok-updates.jsonl")]);
  assert.equal(r.code, 0);
  // The session line is all seven calls, 43,366 in and 791 out (see above).
  assert.deepEqual(scopeLines(r.stdout), expectedScopes(fixtureText("grok-updates.jsonl")));
  assert.doesNotMatch(r.stdout, CANARIES);
});

test("grok receipt: --session finds updates.jsonl under GROK_HOME, ids are validated", async () => {
  const dir = tmp();
  try {
    const id = "00000000-0000-4000-8000-0000000000d1";
    const sessionDir = join(dir, "sessions", "C%3A%5Cproject", id);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "updates.jsonl"), fixtureText("grok-updates.jsonl"));

    assert.equal(findHostSession(id, { GROK_HOME: dir }), join(sessionDir, "updates.jsonl"));
    assert.equal(findHostSession("../etc", { GROK_HOME: dir }), undefined);
    assert.equal(findHostSession("x".repeat(200), { GROK_HOME: dir }), undefined);

    const r = await run(["receipt", "--session", id], undefined, {
      env: { GROK_HOME: dir, CLAUDE_CONFIG_DIR: join(dir, "none") },
    });
    assert.deepEqual(scopeLines(r.stdout), expectedScopes(fixtureText("grok-updates.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("grok: the tested version is pinned in code and named in the README", () => {
  assert.equal(TESTED_HOSTS.grok, "1.0.50");
  const readme = readFileSync(join(pluginRoot, "README.md"), "utf8");
  assert.ok(readme.includes(TESTED_HOSTS.grok), "README names the tested Grok version");
});

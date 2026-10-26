// Tests for the Codex CLI rollout reader, the Codex hook path and the Codex
// plugin packaging.
//
// The fixture carries the SHAPE of a real Codex rollout (0.159.2): record
// types, field names and token counters. Every text value is a CANARY marker,
// so no conversation text is committed, and a canary must never reach any
// output.
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
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
import { disclose, formatReceipt, parseSession, receiptFor } from "../scripts/core.mjs";
import { scopeLines } from "./helpers.mjs";
import {
  TESTED_HOSTS,
  findHostSession,
  parseCodexRollout,
  sniffFormat,
} from "../scripts/hosts.mjs";

// Every child process gets its own config folder, so the local account
// total a receipt writes never lands in the real user config.
const TEST_CONFIG_DIR = mkdtempSync(join(tmpdir(), "rk test config "));
process.on("exit", () => rmSync(TEST_CONFIG_DIR, { recursive: true, force: true }));

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
  return mkdtempSync(join(tmpdir(), "rk codex test "));
}

function approx(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} !== ${expected}`,
  );
}

const libraryWh = (model, inputTokens, outputTokens) =>
  disclosureFromResponse({ provider: "OpenAI", model, inputTokens, outputTokens }).energyWh;

// -- reader --------------------------------------------------------------------

test("codex sniff: a rollout is recognized from its records", () => {
  assert.equal(sniffFormat(fixtureText("codex-rollout.jsonl")), "codex");
  assert.equal(sniffFormat('{"type":"something-new","payload":null}\n'), "unknown");
});

test("codex: one call per distinct token_count, duplicates and null info skipped", () => {
  const p = parseCodexRollout(fixtureText("codex-rollout.jsonl"));
  assert.equal(p.host, "codex");
  assert.equal(p.calls.length, 3);
  assert.equal(p.lastTurn, 2);
  assert.deepEqual(
    p.calls.map((c) => [c.turn, c.turnId, c.model, c.provider]),
    [
      [1, "turn-A", "gpt-5.6-sol", "OpenAI"],
      [1, "turn-A", "gpt-5.6-sol", "OpenAI"],
      [2, "turn-B", "gpt-5.6-sol", "OpenAI"],
    ],
  );
});

test("codex: input_tokens includes the cached tokens, so plain input is the difference", () => {
  const p = parseCodexRollout(fixtureText("codex-rollout.jsonl"));
  assert.deepEqual(p.calls[0].usage, {
    input_tokens: 21747 - 12032,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 12032,
    output_tokens: 273,
  });
  assert.deepEqual(p.calls[2].usage, {
    input_tokens: 15733 - 12288,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 12288,
    output_tokens: 5,
  });
});

test("codex: the session total equals the last running total Codex recorded", () => {
  const t = disclose(parseCodexRollout(fixtureText("codex-rollout.jsonl")).calls).tokens;
  // The fixture's last total_token_usage before the torn line: 66755 in
  // (45952 cached), 645 out. Summed per-call figures must reproduce it.
  assert.equal(t.input, 66755);
  assert.equal(t.cacheRead, 45952);
  assert.equal(t.output, 645);
});

test("codex: a record with no per-call figure falls back to the running-total difference", () => {
  const rec = (total) =>
    JSON.stringify({
      type: "event_msg",
      payload: { type: "token_count", info: { total_token_usage: total } },
    });
  const text = [
    JSON.stringify({ type: "session_meta", payload: { model_provider: "openai" } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "t", model: "gpt-5.4" } }),
    rec({ input_tokens: 1000, cached_input_tokens: 400, output_tokens: 50 }),
    rec({ input_tokens: 2500, cached_input_tokens: 1400, output_tokens: 80 }),
  ].join("\n");
  const p = parseCodexRollout(text);
  assert.equal(p.calls.length, 2);
  assert.deepEqual(p.calls[1].usage, {
    input_tokens: 1500 - 1000,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 1000,
    output_tokens: 30,
  });
});

test("codex: receipt energy equals the library for the same tokens", () => {
  const r = receiptFor(parseSession(fixtureText("codex-rollout.jsonl")));
  approx(r.response.energyWh, libraryWh("gpt-5.6-sol", 15733, 5), "response Wh");
  approx(r.session.energyWh, libraryWh("gpt-5.6-sol", 66755, 645), "session Wh");
  assert.equal(r.session.provenance, "vendor-published");
  assert.equal(r.session.calls, 3);
});

test("codex: the rollout's text never reaches the receipt", () => {
  const p = parseCodexRollout(fixtureText("codex-rollout.jsonl"));
  assert.doesNotMatch(JSON.stringify(p), CANARIES);
  assert.doesNotMatch(formatReceipt(receiptFor(p)), CANARIES);
});

// -- hook ----------------------------------------------------------------------

/** The receipt the hook should print for a rollout's text, as scope lines. */
const expectedScopes = (text) => scopeLines(formatReceipt(receiptFor(parseSession(text))));

test("codex hook: prints the receipt as systemMessage with the five-line shape", async () => {
  const r = await runHook({
    session_id: "00000000-0000-4000-8000-0000000000c1",
    turn_id: "turn-B",
    transcript_path: fixture("codex-rollout.jsonl"),
    cwd: "CANARY_CWD",
    hook_event_name: "Stop",
    model: "gpt-5.6-sol",
    permission_mode: "default",
    stop_hook_active: false,
    last_assistant_message: "CANARY_REPLY_TEXT_B",
  });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), ["systemMessage"]);
  const lines = out.systemMessage.split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[4], /^A guess, not a measurement\. Cached text counted as free\./);
  assert.doesNotMatch(out.systemMessage, CANARIES);
  // The response and session lines are the formatter's for this rollout:
  // turn-B's 15,733 in and 5 out, and all three calls (see the energy test above).
  assert.deepEqual(scopeLines(out.systemMessage), expectedScopes(fixtureText("codex-rollout.jsonl")));
  assert.match(lines[2], /^your account on this computer {2}~/);
});

test("codex hook: a null transcript_path (an ephemeral run) is silent", async () => {
  const r = await runHook({
    session_id: "x",
    turn_id: "t",
    transcript_path: null,
    hook_event_name: "Stop",
    model: "gpt-5.6-sol",
    last_assistant_message: "ok",
  });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("codex hook: waits for the rollout to hold this turn's token_count", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "rollout.jsonl");
    const all = fixtureText("codex-rollout.jsonl").split("\n").filter((l) => l.length > 0);
    const early = all.filter((l) => !l.includes('"turn-B"') && !l.includes('"ordinal":14'));
    writeFileSync(path, early.join("\n") + "\n");
    const taskStarted = all.find((l) => l.includes('"task_started"') && l.includes('"turn-B"'));
    const turnContext = all.find((l) => l.includes('"turn_context"') && l.includes('"turn-B"'));
    const tokenCount = all.find((l) => l.includes('"ordinal":14'));
    setTimeout(() => appendFileSync(path, taskStarted + "\n" + turnContext + "\n"), 300);
    setTimeout(() => appendFileSync(path, tokenCount + "\n"), 600);
    const r = await runHook({
      session_id: "x",
      turn_id: "turn-B",
      transcript_path: path,
      hook_event_name: "Stop",
    });
    assert.equal(r.code, 0);
    const text = JSON.parse(r.stdout).systemMessage;
    // The late call is counted: the lines are the full rollout's, which differ
    // from the lines of the rollout without it.
    assert.deepEqual(scopeLines(text), expectedScopes(fixtureText("codex-rollout.jsonl")), "the late call is counted");
    assert.notDeepEqual(scopeLines(text), expectedScopes(early.join("\n")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("codex hook: a turn that never lands is silent, not mislabeled", async () => {
  const r = await runHook({
    session_id: "x",
    turn_id: "turn-NOT-IN-THE-FILE",
    transcript_path: fixture("codex-rollout.jsonl"),
    hook_event_name: "Stop",
  });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("codex hook: a rollout in a shape this reader does not know prints nothing", async () => {
  const dir = tmp();
  try {
    const path = join(dir, "rollout.jsonl");
    // Same record types, but the usage block moved: no counters are found.
    writeFileSync(
      path,
      [
        JSON.stringify({ type: "session_meta", payload: { model_provider: "openai" } }),
        JSON.stringify({
          type: "event_msg",
          payload: { type: "token_count", info: { usage_v2: { in: 5, out: 5 } } },
        }),
      ].join("\n") + "\n",
    );
    const r = await runHook({ turn_id: "t", transcript_path: path, hook_event_name: "Stop" });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -- on-demand receipt ---------------------------------------------------------

test("codex receipt: --session finds a rollout by id under CODEX_HOME", async () => {
  const dir = tmp();
  try {
    const id = "00000000-0000-4000-8000-0000000000c1";
    const day = join(dir, "sessions", "2026", "01", "01");
    mkdirSync(day, { recursive: true });
    const file = join(day, `rollout-2026-01-01T00-00-00-${id}.jsonl`);
    writeFileSync(file, fixtureText("codex-rollout.jsonl"));

    assert.equal(findHostSession(id, { CODEX_HOME: dir, GROK_HOME: join(dir, "none") }), file);
    assert.equal(findHostSession("../x", { CODEX_HOME: dir }), undefined);

    const r = await run(["receipt", "--session", id], undefined, {
      env: { CODEX_HOME: dir, CLAUDE_CONFIG_DIR: join(dir, "none"), GROK_HOME: join(dir, "none") },
    });
    assert.deepEqual(scopeLines(r.stdout), expectedScopes(fixtureText("codex-rollout.jsonl")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -- packaging -----------------------------------------------------------------

test("codex packaging: manifest, hook file and versions agree", () => {
  const claude = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, claude.name);
  assert.equal(manifest.version, claude.version, "Codex and Claude manifests carry one version");
  assert.equal(manifest.hooks, "./hooks/codex-hooks.json");
  assert.ok(manifest.hooks.startsWith("./") && !manifest.hooks.includes(".."));
  assert.ok(existsSync(join(pluginRoot, manifest.hooks)));

  const hooks = JSON.parse(readFileSync(join(pluginRoot, "hooks", "codex-hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(hooks.hooks), ["Stop"]);
  const stop = hooks.hooks.Stop[0].hooks[0];
  assert.equal(stop.type, "command");
  // Codex runs a single command string; it has no args array. PLUGIN_ROOT is
  // substituted by Codex, and the path is quoted for a folder with spaces.
  assert.equal(stop.args, undefined);
  assert.equal(stop.command, 'node "${PLUGIN_ROOT}/scripts/aieds.mjs" hook');
  assert.ok(stop.timeout <= 30, "a short timeout: a receipt must never stall a session");
});

test("codex: the tested version is pinned in code and named in the README", () => {
  assert.equal(TESTED_HOSTS.codex, "0.162.1");
  const readme = readFileSync(join(pluginRoot, "README.md"), "utf8");
  assert.ok(readme.includes(TESTED_HOSTS.codex), "README names the tested Codex version");
});

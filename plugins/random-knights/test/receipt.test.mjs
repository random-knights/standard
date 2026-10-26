// Tests for the Random Knights AiEDs Claude Code plugin.
//
// The fixtures under test/fixtures carry the SHAPE of a Claude Code session
// transcript (entry types, message ids, usage counters, model names) with every
// text value replaced by a CANARY marker. No conversation text is committed. A
// canary must never reach any output: that is the privacy test.
import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  WATER_BANNED_WORDS,
  disclosureFromResponse,
  treeTimeLabel,
  waterFromEnergyWh,
  waterLine,
} from "../vendor/lib/dist/index.js";
import {
  REQUIRED_COPY,
  comparisonLine,
  disclose,
  expandHome,
  findTranscript,
  formatAccount,
  formatCarbon,
  formatDriving,
  formatEnergy,
  formatExplanation,
  formatPhoneCharges,
  formatReceipt,
  formatResponseReceipt,
  formatTreeTime,
  formatWater,
  formatWaterDetail,
  isSafeSessionId,
  logLine,
  oneFigureText,
  parseTranscript,
  receiptFor,
  receiptsEnabled,
} from "../scripts/core.mjs";
import {
  ACCOUNT_FORMAT,
  accountKey,
  accountPath,
  accountTotal,
  configDir,
  loadAccount,
  recordSession,
  resetAccount,
  saveConnection,
  withSession,
} from "../scripts/store.mjs";

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
const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

// -- helpers -------------------------------------------------------------------

function runNode(args, { input, env = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, args, {
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
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
    return child;
  });
}

const runHook = (input, opts = {}) =>
  runNode([script, "hook"], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    ...opts,
  });

function tmp(prefix = "rk plugin test ") {
  // A space in the directory name is deliberate: Windows paths have them.
  return mkdtempSync(join(tmpdir(), prefix));
}

function approx(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} !== ${expected}`,
  );
}

// -- transcript parsing --------------------------------------------------------

test("parse: one call per message id, counters merged by maximum", () => {
  const p = parseTranscript(fixtureText("session-tool-turns.jsonl"));
  assert.deepEqual(
    p.calls.map((c) => c.id),
    ["msg_FIXTURE_A", "msg_FIXTURE_B", "msg_FIXTURE_S", "msg_FIXTURE_D"],
  );
  const a = p.calls[0];
  // The first line of message A carried a streaming-partial output counter of 2;
  // the final value is 57. Taking the maximum is what makes the figure whole.
  assert.equal(a.usage.output_tokens, 57);
  assert.equal(a.usage.cache_creation_input_tokens, 18000);
});

test("parse: synthetic placeholders, meta prompts and a torn last line do not count", () => {
  const p = parseTranscript(fixtureText("session-tool-turns.jsonl"));
  assert.equal(p.calls.length, 4);
  assert.ok(!p.calls.some((c) => c.model === "<synthetic>"));
  assert.equal(p.lastTurn, 2);
});

test("parse: a tool result is not a new turn, a prompt is", () => {
  const p = parseTranscript(fixtureText("session-tool-turns.jsonl"));
  assert.deepEqual(
    p.calls.map((c) => c.turn),
    [1, 1, 2, 2],
  );
});

test("parse: CRLF line endings and blank lines are tolerated", () => {
  const crlf = fixtureText("session-mixed-models.jsonl").replace(/\n/g, "\r\n\r\n");
  const p = parseTranscript(crlf);
  assert.equal(p.calls.length, 3);
});

test("parse: empty and non-JSON input yields no calls and never throws", () => {
  for (const text of ["", "not json\nstill not json\n", "[]\nnull\n42\n"]) {
    const p = parseTranscript(text);
    assert.equal(p.calls.length, 0);
  }
});

test("parse: a missing counter counts as zero, a negative or NaN one too", () => {
  const line = JSON.stringify({
    type: "assistant",
    message: {
      id: "msg_x",
      role: "assistant",
      model: "claude-sonnet-4-5",
      content: [],
      usage: { input_tokens: -5, output_tokens: "7", cache_read_input_tokens: 12 },
    },
  });
  const [c] = parseTranscript(line).calls;
  assert.deepEqual(c.usage, {
    input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 12,
    output_tokens: 0,
  });
});

// -- the math is the library's math --------------------------------------------

test("receipt: the latest response equals the library called with the same tokens", () => {
  const parsed = parseTranscript(fixtureText("session-tool-turns.jsonl"));
  const { response } = receiptFor(parsed);

  // Turn 2 is the sidechain call plus the final call, both claude-sonnet-4-5.
  const expected = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-sonnet-4-5-20250929",
    inputTokenBreakdown: { plain: 5 + 2, cacheCreation: 0, cacheRead: 9000 + 18450 },
    outputTokens: 300 + 90,
  });
  assert.equal(response.energyWh, expected.energyWh);
  assert.equal(response.carbonGrams, expected.carbonGrams);
  assert.equal(response.treeTimeMinutes, expected.treeTimeMinutes);
  assert.equal(response.treeTimeLabel, expected.treeTimeLabel);
  assert.equal(response.calls, 2);
  assert.equal(response.tokens.input, 7 + 27450);
  assert.equal(response.tokens.output, 390);
  assert.equal(response.provenance, "class-estimated");
  assert.equal(response.confidence, "low");
});

test("receipt: independent arithmetic agrees with the library for claude", () => {
  // energyWh = (in/1000 * 0.145 + out/1000 * 0.58) * 1.2, carbon = Wh/1000*429,
  // treeMin = carbon / 21000 * 525600. Typed here from the methodology so a
  // change to the library's table fails this test instead of passing silently.
  const { response } = receiptFor(
    parseTranscript(fixtureText("session-tool-turns.jsonl")),
  );
  const wh = ((27457 / 1000) * 0.145 + (390 / 1000) * 0.58) * 1.2;
  approx(response.energyWh, wh, "energyWh");
  approx(response.carbonGrams, (wh / 1000) * 429, "carbonGrams");
  approx(response.treeTimeMinutes, ((wh / 1000) * 429) / 21000 * 525600, "treeTimeMinutes");
});

test("receipt: session total spans every call, split by model coefficient", () => {
  const { session } = receiptFor(
    parseTranscript(fixtureText("session-tool-turns.jsonl")),
  );
  const opus = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-opus-4-1-20250805",
    inputTokenBreakdown: { plain: 3 + 1, cacheCreation: 18000 + 450, cacheRead: 18000 },
    outputTokens: 57 + 212,
  });
  const sonnet = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-sonnet-4-5-20250929",
    inputTokenBreakdown: { plain: 7, cacheCreation: 0, cacheRead: 27450 },
    outputTokens: 390,
  });
  approx(session.energyWh, opus.energyWh + sonnet.energyWh, "session energy");
  approx(session.carbonGrams, opus.carbonGrams + sonnet.carbonGrams, "session carbon");
  assert.equal(session.calls, 4);
});

test("receipt: cache tokens are input at the full input coefficient (2.4.1)", () => {
  const withCache = disclose([
    {
      id: "a",
      model: "claude-sonnet-4-5",
      turn: 1,
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 400,
        cache_read_input_tokens: 600,
        output_tokens: 0,
      },
    },
  ]);
  const plain = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-sonnet-4-5",
    inputTokens: 1000,
    outputTokens: 0,
  });
  assert.equal(withCache.energyWh, plain.energyWh);
  // The short receipt's count is separate and leaves the ratified one alone.
  const writesOnly = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-sonnet-4-5",
    inputTokens: 400,
    outputTokens: 0,
  });
  assert.equal(withCache.counted.energyWh, writesOnly.energyWh);
});

test("receipt count: cache reads are free; plain input, cache writes and output are charged with PUE", () => {
  const d = disclose([
    {
      id: "a",
      model: "claude-opus-4-1",
      turn: 1,
      usage: {
        input_tokens: 10000,
        cache_creation_input_tokens: 220000,
        cache_read_input_tokens: 2320000,
        output_tokens: 9500,
      },
    },
  ]);
  // Typed from the methodology, not read from the library: claude is
  // 0.145 Wh per 1k input, 0.58 per 1k output, PUE 1.2.
  const charged = ((10000 + 220000) / 1000) * 0.145 + (9500 / 1000) * 0.58;
  const wh = charged * 1.2;
  approx(d.counted.energyWh, wh, "counted energy");
  approx(d.counted.carbonGrams, (wh / 1000) * 429, "counted carbon");
  approx(d.counted.treeTimeMinutes, ((wh / 1000) * 429) / 21000 * 525600, "counted tree-time");
  approx(d.counted.waterMl, waterFromEnergyWh(wh).waterMl.default, "counted water");
  // The ratified 2.4.1 count is unchanged: every input token at the input rate.
  approx(d.energyWh, ((2550000 / 1000) * 0.145 + (9500 / 1000) * 0.58) * 1.2, "ratified energy");
  assert.ok(d.counted.energyWh < d.energyWh / 9, "the floor is far below the ratified count here");
  // No discount coefficient: a cache read adds exactly nothing, at any size.
  const more = disclose([{ id: "b", model: "claude-opus-4-1", turn: 1, usage: { input_tokens: 10000, cache_creation_input_tokens: 220000, cache_read_input_tokens: 9e9, output_tokens: 9500 } }]);
  assert.equal(more.counted.energyWh, d.counted.energyWh);
});

test("receipt: an unlisted model gets the class estimate and says so", () => {
  const { session } = receiptFor(
    parseTranscript(fixtureText("session-mixed-models.jsonl")),
  );
  assert.equal(session.provenance, "unknown");
  const text = formatReceipt(receiptFor(parseTranscript(fixtureText("session-mixed-models.jsonl"))));
  // Only the model with no figure is named; the listed ones are not.
  assert.match(text, / No published figure for acme-llm-1, so a general guess is used\.$/m);
  assert.deepEqual(session.noFigure, ["acme-llm-1"]);
  const gem = disclosureFromResponse({
    provider: "Anthropic",
    model: "gemini-2.0-flash",
    inputTokens: 1000,
    outputTokens: 1000,
  });
  const unk = disclosureFromResponse({
    provider: "Anthropic",
    model: "acme-llm-1",
    inputTokens: 2000,
    outputTokens: 500,
  });
  const cl = disclosureFromResponse({
    provider: "Anthropic",
    model: "claude-sonnet-4-5-20250929",
    inputTokens: 10,
    outputTokens: 100,
  });
  approx(session.energyWh, gem.energyWh + unk.energyWh + cl.energyWh, "mixed energy");
});

test("receipt: no calls yields a zero, class-labeled disclosure, not NaN", () => {
  const d = disclose([]);
  assert.equal(d.energyWh, 0);
  assert.equal(d.treeTimeLabel, treeTimeLabel(0));
  assert.ok(Number.isFinite(d.carbonGrams));
});

// -- wording and decimal rules -------------------------------------------------

const ALL_TEXTS = () => {
  const parsed = parseTranscript(fixtureText("session-tool-turns.jsonl"));
  const receipt = receiptFor(parsed);
  const mixed = receiptFor(parseTranscript(fixtureText("session-mixed-models.jsonl")));
  const account = { counted: receipt.session.counted, sessions: 1, since: "", linked: false };
  return {
    receipt: formatReceipt(receipt, account),
    linkedReceipt: formatReceipt(receipt, { ...account, linked: true }),
    mixedReceipt: formatReceipt(mixed, account),
    response: formatResponseReceipt(receipt.response),
    account: formatAccount(account, { sessions: 1, since: "2026-10-26T00:00:00.000Z" }),
    explain: formatExplanation(),
    explainWithReceipt: formatExplanation(receipt, account),
  };
};

/** The receipt line that starts with `label`, or "". */
const lineOf = (text, label) => text.split("\n").find((l) => l.startsWith(`${label} `)) ?? "";

const BASIS ="A guess, not a measurement. Cached text counted as free. Comparisons are for scale only.";

test("copy: the three required sentences live in explain, verbatim, and a receipt ends in one basis line", () => {
  assert.deepEqual(REQUIRED_COPY, [
    "Energy and carbon are modeled estimates.",
    "Tree-Time and equivalents are educational comparisons.",
    "Water is a modeled estimate.",
  ]);
  const texts = ALL_TEXTS();
  for (const name of ["explain", "explainWithReceipt"]) {
    for (const sentence of REQUIRED_COPY) {
      assert.ok(texts[name].includes(sentence), `${name} lacks: ${sentence}`);
    }
  }
  for (const name of ["receipt", "linkedReceipt", "mixedReceipt", "response"]) {
    const last = texts[name].split("\n").at(-1);
    assert.ok(last.startsWith(BASIS), `${name} does not end in the basis line: ${last}`);
    for (const sentence of REQUIRED_COPY) {
      assert.ok(!texts[name].includes(sentence), `${name} repeats the boilerplate: ${sentence}`);
    }
  }
});

test("copy: the receipt is plain words: no Level, no version stamp, no percentages, no token counts", () => {
  const texts = ALL_TEXTS();
  for (const name of ["receipt", "linkedReceipt", "mixedReceipt", "response", "account"]) {
    const t = texts[name];
    assert.doesNotMatch(t, /\bLevel\b|ladder|AiEDs|v2\b|methodology|%|cache read|tokens?\b|confidence|provenance|class estimate/i, `${name}: ${t}`);
  }
});

test("receipt shape: exactly three scope lines, then the comparisons line, then the basis line", () => {
  const lines = ALL_TEXTS().receipt.split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^this response {2,}~/);
  assert.match(lines[1], /^this session {2,}~/);
  assert.match(lines[2], /^your account on this computer {2}~/);
  for (const l of lines.slice(0, 3)) {
    assert.match(l, /~\S+ (Wh|kWh|MWh), ~\S+ (g|kg|t) CO2e, ~\S+ (mL|L) water, ~\S+ (min|h|days?|years?) tree-time$/, l);
  }
  // The figures start in one column.
  assert.equal(new Set(lines.slice(0, 3).map((l) => l.indexOf("~"))).size, 1);
  assert.match(lines[3], /^your account on this computer so far is (about [\d,.]+ phone charges?|less than one phone charge), or (about [\d,.]+ k?m|less than 1 m) of driving\.$/);
  assert.equal(lines[4], BASIS);
  // Linked: the label is "your account", in the same column as the others.
  const linked = ALL_TEXTS().linkedReceipt.split("\n");
  assert.match(linked[2], /^your account {4}~/);
  assert.match(linked[3], /^your account so far is /);
  assert.equal(new Set(linked.slice(0, 3).map((l) => l.indexOf("~"))).size, 1);
});

test("copy: the word offset never appears, in output or in shipped text", () => {
  for (const [name, text] of Object.entries(ALL_TEXTS())) {
    assert.doesNotMatch(text, /offset/i, name);
  }
  const shipped = [
    join(pluginRoot, "README.md"),
    join(pluginRoot, "skills", "aieds", "SKILL.md"),
    join(pluginRoot, "skills", "aieds-explain", "SKILL.md"),
    join(pluginRoot, "skills", "aieds-account", "SKILL.md"),
    join(pluginRoot, "skills", "aieds-account-reset", "SKILL.md"),
    join(pluginRoot, "scripts", "store.mjs"),
    join(pluginRoot, ".claude-plugin", "plugin.json"),
    join(pluginRoot, "hooks", "hooks.json"),
    join(pluginRoot, "scripts", "core.mjs"),
    join(pluginRoot, "scripts", "aieds.mjs"),
  ];
  for (const f of shipped) {
    if (!existsSync(f)) continue;
    const body = readFileSync(f, "utf8");
    assert.doesNotMatch(body, /offset/i, f);
  }
});

test("copy: ASCII only, no em or en dash, no exclamation mark", () => {
  for (const [name, text] of Object.entries(ALL_TEXTS())) {
    assert.ok(!text.includes(EM_DASH), `${name} has an em dash`);
    assert.ok(!text.includes(EN_DASH), `${name} has an en dash`);
    assert.ok(!text.includes("!"), `${name} has an exclamation mark`);
    // eslint-disable-next-line no-control-regex
    assert.match(text, /^[\x09\x0a\x20-\x7e]*$/, `${name} is not ASCII`);
  }
});

test("copy: no canary text from the transcript reaches any output", () => {
  for (const [name, text] of Object.entries(ALL_TEXTS())) {
    assert.doesNotMatch(text, CANARIES, name);
  }
});

test("rounding: one significant figure with a tilde, units step up, thousands separators", () => {
  const table = [
    [formatEnergy, 0, "0 Wh"],
    [formatEnergy, 0.0068, "~0.007 Wh"],
    [formatEnergy, 0.44117, "~0.4 Wh"],
    [formatEnergy, 0.96, "~1 Wh"],
    [formatEnergy, 9.6, "~10 Wh"],
    [formatEnergy, 46.632, "~50 Wh"],
    [formatEnergy, 95, "~100 Wh"],
    [formatEnergy, 450.3, "~500 Wh"],
    [formatEnergy, 949, "~900 Wh"],
    [formatEnergy, 950, "~1 kWh"],
    [formatEnergy, 999, "~1 kWh"],
    [formatEnergy, 1000, "~1 kWh"],
    [formatEnergy, 15610, "~20 kWh"],
    [formatEnergy, 999999, "~1 MWh"],
    [formatEnergy, 2.4e6, "~2 MWh"],
    [formatEnergy, 3.2e9, "~3,000 MWh"],
    [formatCarbon, 0.117, "~0.1 g CO2e"],
    [formatCarbon, 20.005, "~20 g CO2e"],
    [formatCarbon, 157.23, "~200 g CO2e"],
    [formatCarbon, 999.6, "~1 kg CO2e"],
    [formatCarbon, 2243.5, "~2 kg CO2e"],
    [formatCarbon, 1.5e6, "~2 t CO2e"],
    [formatWater, 1.33, "~1 mL"],
    [formatWater, 49, "~50 mL"],
    [formatWater, 95, "~0.1 L"],
    [formatWater, 227.56, "~0.2 L"],
    [formatWater, 25520, "~30 L"],
    [formatWater, 1234567, "~1,000 L"],
    [formatTreeTime, 0, "0 min"],
    [formatTreeTime, 0.07, "~0.07 min"],
    [formatTreeTime, 39.4, "~40 min"],
    [formatTreeTime, 55, "~0.9 h"],
    [formatTreeTime, 500.7, "~8 h"],
    [formatTreeTime, 1440, "~20 h"],
    [formatTreeTime, 2879, "~2 days"],
    [formatTreeTime, 56151, "~40 days"],
    [formatTreeTime, 1440 * 300, "~300 days"],
    [formatTreeTime, 1440 * 360, "~1 year"],
    [formatTreeTime, 525600 * 3, "~3 years"],
    [formatTreeTime, 525600 * 12345, "~10,000 years"],
  ];
  for (const [fn, value, expected] of table) {
    assert.equal(fn(value), expected, `${fn.name}(${value})`);
  }
  assert.equal(oneFigureText(-3), "0");
  assert.equal(oneFigureText(Number.NaN), "0");
  assert.equal(oneFigureText(0.000123), "0.0001");
});

test("rounding: no figure on any receipt carries more than one significant figure", () => {
  for (const [name, text] of Object.entries(ALL_TEXTS())) {
    if (name.startsWith("explain")) continue;
    for (const m of text.matchAll(/~([\d,.]+) /g)) {
      const digits = m[1].replace(/[,.]/g, "").replace(/^0+/, "").replace(/0+$/, "");
      assert.ok(digits.length <= 1, `${name}: ${m[0]} has more than one significant figure`);
    }
  }
});

test("comparisons: phone charges and driving use the standard's own constants, rounded the same way", () => {
  assert.equal(formatPhoneCharges(12 * 400), "about 400 phone charges");
  assert.equal(formatPhoneCharges(12), "about 1 phone charge");
  assert.equal(formatPhoneCharges(12 * 1234), "about 1,000 phone charges");
  assert.equal(formatPhoneCharges(6), "less than one phone charge");
  assert.equal(formatPhoneCharges(0), "less than one phone charge");
  assert.equal(formatDriving(170 * 10), "about 10 km");
  assert.equal(formatDriving(170 * 0.3), "about 300 m");
  assert.equal(formatDriving(170 * 0.96), "about 1 km");
  assert.equal(formatDriving(0.05), "less than 1 m");
  // The line is built from the ACCOUNT total it is given, not from a session.
  const account = { counted: { energyWh: 12 * 400, carbonGrams: 170 * 10, waterMl: 1, treeTimeMinutes: 1 }, linked: false };
  assert.equal(
    comparisonLine(account),
    "your account on this computer so far is about 400 phone charges, or about 10 km of driving.",
  );
  assert.equal(
    comparisonLine({ ...account, linked: true }),
    "your account so far is about 400 phone charges, or about 10 km of driving.",
  );
  const r = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
  const text = formatReceipt(r, account);
  assert.ok(text.includes("about 400 phone charges, or about 10 km of driving."), text);
});

function callsOf(n, usage) {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    model: "claude-sonnet-5-5",
    turn: 1,
    usage: {
      input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 0,
      ...usage,
    },
  }));
}

const asAccount = (d, linked = false) => ({ counted: d.counted, sessions: 1, since: "", linked });

test("format: the cache-heavy receipt from the owner, exactly, cache reads counted as free", () => {
  const response = callsOf(1, {
    cache_read_input_tokens: 2044863,
    cache_creation_input_tokens: 32211,
    output_tokens: 7322,
  });
  const rest = callsOf(573, {
    cache_read_input_tokens: 150000,
    cache_creation_input_tokens: 2000,
    output_tokens: 300,
  });
  const session = disclose([...response, ...rest]);
  const text = formatReceipt({ response: disclose(response), session }, asAccount(session));
  assert.equal(
    text,
    [
      "this response                  ~10 Wh, ~5 g CO2e, ~50 mL water, ~2 h tree-time",
      "this session                   ~300 Wh, ~100 g CO2e, ~2 L water, ~2 days tree-time",
      "your account on this computer  ~300 Wh, ~100 g CO2e, ~2 L water, ~2 days tree-time",
      "your account on this computer so far is about 30 phone charges, or about 800 m of driving.",
      BASIS,
    ].join("\n"),
  );
});

test("format: the owner's sample turn, 2.55M in with 2.32M cache read and 9.5k out, reads about 50 Wh", () => {
  const parsed = parseTranscript(fixtureText("session-owner-sample.jsonl"));
  const receipt = receiptFor(parsed);
  // The ratified count, the number that looked wrong: about 450 Wh.
  approx(receipt.response.energyWh, ((2550000 / 1000) * 0.145 + (9500 / 1000) * 0.58) * 1.2, "ratified");
  const text = formatReceipt(receipt, asAccount(receipt.session));
  assert.equal(
    text,
    [
      "this response                  ~50 Wh, ~20 g CO2e, ~0.2 L water, ~8 h tree-time",
      "this session                   ~60 Wh, ~30 g CO2e, ~0.3 L water, ~10 h tree-time",
      "your account on this computer  ~60 Wh, ~30 g CO2e, ~0.3 L water, ~10 h tree-time",
      "your account on this computer so far is about 5 phone charges, or about 200 m of driving.",
      BASIS,
    ].join("\n"),
  );
});

test("format: a tiny response, and a long session in kWh, kg and days", () => {
  const one = callsOf(1, { input_tokens: 15, output_tokens: 6 });
  const d = disclose(one);
  assert.equal(
    formatReceipt({ response: d, session: d }, asAccount(d, true)),
    [
      "this response   ~0.007 Wh, ~0.003 g CO2e, ~0.03 mL water, ~0.07 min tree-time",
      "this session    ~0.007 Wh, ~0.003 g CO2e, ~0.03 mL water, ~0.07 min tree-time",
      "your account    ~0.007 Wh, ~0.003 g CO2e, ~0.03 mL water, ~0.07 min tree-time",
      "your account so far is less than one phone charge, or less than 1 m of driving.",
      BASIS,
    ].join("\n"),
  );
  const resp = callsOf(1, {
    input_tokens: 20000,
    cache_read_input_tokens: 350000,
    cache_creation_input_tokens: 30000,
    output_tokens: 5000,
  });
  const rest = callsOf(1999, {
    input_tokens: 1000,
    cache_read_input_tokens: 400000,
    cache_creation_input_tokens: 8000,
    output_tokens: 1500,
  });
  const session = disclose([...resp, ...rest]);
  assert.equal(
    formatReceipt({ response: disclose(resp), session }, asAccount(session, true)),
    [
      "this response   ~10 Wh, ~5 g CO2e, ~60 mL water, ~2 h tree-time",
      "this session    ~5 kWh, ~2 kg CO2e, ~30 L water, ~40 days tree-time",
      "your account    ~5 kWh, ~2 kg CO2e, ~30 L water, ~40 days tree-time",
      "your account so far is about 400 phone charges, or about 10 km of driving.",
      BASIS,
    ].join("\n"),
  );
});

test("format: a wrapper receipt is the response line and the basis line, nothing else", () => {
  const text = formatResponseReceipt(disclose(callsOf(1, { input_tokens: 800, cache_read_input_tokens: 200, output_tokens: 10 })));
  assert.equal(
    text,
    ["this response   ~0.1 Wh, ~0.06 g CO2e, ~0.7 mL water, ~2 min tree-time", BASIS].join("\n"),
  );
});

test("format: the receipt carries the tilde water figure and no range", () => {
  const text = formatReceipt(receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl"))));
  assert.match(text, /^this response {3}~[\d.]+ Wh, ~[\d.]+ g CO2e, ~[\d.]+ (mL|L) water, ~[\d.]+ (min|h) tree-time$/m);
  assert.match(text, /^this session {4}~/m);
  assert.doesNotMatch(text, / to [\d.]+ (mL|L)|teaspoon/);
  assert.doesNotMatch(text, /claude-opus|claude-sonnet/, "a listed model is not named on the short receipt");
});

// -- water (methodology 2.6) ---------------------------------------------------

test("water: the receipt figure is the library's, from the same energy, and the detail line keeps the range", () => {
  const receipt = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
  const { response, session } = receipt;
  assert.deepEqual(response.water, waterFromEnergyWh(response.energyWh));
  assert.equal(formatWaterDetail(response), waterLine(waterFromEnergyWh(response.energyWh)));
  assert.match(formatWater(response.counted.waterMl), /^~[\d.]+ (mL|L)$/);
  // The short receipt's water is the library's water of the short receipt's energy.
  assert.equal(response.counted.waterMl, waterFromEnergyWh(response.counted.energyWh).waterMl.default);
  assert.equal(response.water.confidence, "low");
  assert.equal(response.water.basis, "US average");
  // Water is linear in energy, so the session is at least the response.
  assert.ok(session.water.waterMl.default >= response.water.waterMl.default);
});

test("water: the range, the teaspoons and the modeled-estimate words are in explain, not on the receipt", () => {
  const receipt = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
  assert.doesNotMatch(formatReceipt(receipt), /Modeled estimate|Water:/);
  const explained = formatExplanation(receipt);
  assert.match(
    explained,
    /Water: about \d+(\.\d+)? mL \(\d+(\.\d+)? to \d+(\.\d+)? mL\), [a-z0-9. ]*teaspoons?\. Modeled estimate\./,
  );
  assert.ok(explained.trimEnd().endsWith("Water is a modeled estimate."), "the third sentence closes explain");
});

test("water: the example in the brief, 0.24 Wh", () => {
  assert.equal(
    waterLine(waterFromEnergyWh(0.24)),
    "Water: about 1.2 mL (0.4 to 2.7 mL), about a quarter of a teaspoon. Modeled estimate.",
  );
});

test("water: no banned word, no scarcity or credit claim, anywhere in the receipt text", () => {
  for (const [name, text] of Object.entries(ALL_TEXTS())) {
    for (const w of WATER_BANNED_WORDS) {
      if (w === "offset") continue; // asserted over every shipped file above
      assert.doesNotMatch(text, new RegExp(`\\b${w}\\b`, "i"), `${name} uses "${w}"`);
    }
  }
  const water = Object.values(ALL_TEXTS())
    .join(" ")
    .match(/Water: about[^.]*\.[^.]*\./g);
  assert.ok(water && water.length > 0);
  for (const line of water) assert.doesNotMatch(line, /scarc|impact|your area/i, line);
});

test("water: no energy means no water claim, never a zero", () => {
  const d = disclose([]);
  assert.equal(d.counted.waterMl, 0);
  assert.doesNotMatch(formatResponseReceipt(d), /water/, "no energy, no water figure on the line");
  assert.ok(d.water === null || d.water.waterMl.default === 0);
});

test("explain: formulas and coefficient sources come from the library table", () => {
  const text = formatExplanation();
  assert.match(text, /energyWh = inTok\/1000 \* whPer1kIn \+ outTok\/1000 \* whPer1kOut/);
  assert.match(text, /gCO2e = energyWh\/1000 \* 429$/m);
  assert.match(text, /treeTimeMinutes = gCO2e \/ 21000 \* 525600$/m);
  assert.match(text, /429 gCO2e\/kWh/);
  assert.match(text, /21000 gCO2e\/year/);
  assert.match(text, /claude: 0\.145 \/ 0\.58, PUE 1\.2, class-estimated/);
  assert.match(text, /arxiv\.org\/abs\/2508\.15734/);
  assert.match(text, /waterL = siteL \+ gridL/);
  assert.match(text, /site 0\.36 L\/kWh \(0\.27 to 1\.8\), grid 4\.52 L\/kWh \(1\.5 to 9\.5\), US average/);
  assert.match(text, /LBNL-2001637/);
  assert.doesNotMatch(text, /This receipt, unrounded/, "no session, no receipt section");
  // The detail keeps what the short receipt leaves out: the counting rule and
  // that it is a proposal, not the ratified count.
  assert.match(text, /Cached prefill \(section 2\.4\.1\): cache-write and cache-read tokens are input/);
  assert.match(text, /Short receipt \(PROPOSED methodology section 2\.7, not ratified\): .*counts cache-read tokens as free/);
  assert.match(text, /12 Wh per phone charge, 170 gCO2e per km of driving/);
});

test("explain: with a receipt it carries the unrounded figures, the water range and the full counts", () => {
  const receipt = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
  const text = formatExplanation(receipt);
  const { response: r, session: s } = receipt;
  assert.match(text, /This receipt, unrounded/);
  assert.ok(text.includes(`energy ${r.energyWh} Wh, carbon ${r.carbonGrams} gCO2e, tree-time ${r.treeTimeMinutes} minutes`));
  assert.ok(text.includes(`energy ${s.energyWh} Wh`));
  const w = r.water.waterMl;
  assert.ok(text.includes(`water ${w.default} mL (range ${w.low} to ${w.high} mL)`));
  assert.match(text, /tokens 27,457 in \(7 plain, 0 cache write, 27,450 cache read\), 390 out; 2 model calls/);
  assert.match(text, /basis AiEDs v2, methodology .*class estimate, low confidence/);
  const c = r.counted;
  assert.ok(
    text.includes(
      `short receipt (cache reads free): energy ${c.energyWh} Wh, carbon ${c.carbonGrams} gCO2e, ` +
        `water ${c.waterMl} mL, tree-time ${c.treeTimeMinutes} minutes`,
    ),
  );
  const withAccount = formatExplanation(receipt, { counted: s.counted, sessions: 2, linked: false });
  assert.match(withAccount, /your account on this computer, short receipt count, unrounded:\n {2}short receipt \(cache reads free\): energy /);
  assert.match(withAccount, /2 sessions counted, kept only on this computer\./);
});

test("explain command: --transcript adds the unrounded receipt, an unknown session falls back to the formulas", async () => {
  const withReceipt = await runNode([script, "explain", "--transcript", fixture("session-tool-turns.jsonl")]);
  assert.equal(withReceipt.code, 0, withReceipt.stderr);
  assert.match(withReceipt.stdout, /This receipt, unrounded/);
  assert.match(withReceipt.stdout, /water [\d.]+ mL \(range [\d.]+ to [\d.]+ mL\)/);
  const bare = await runNode([script, "explain", "--session", "no-such-session"]);
  assert.equal(bare.code, 0, bare.stderr);
  assert.doesNotMatch(bare.stdout, /This receipt, unrounded|No transcript was found/);
  assert.match(bare.stdout, /Formulas \(methodology section 2\.4\)/);
});

// -- the hook as Claude Code runs it -------------------------------------------

test("hook: prints exactly the systemMessage the library-backed formatter builds", async () => {
  const dir = tmp();
  try {
    const transcript = join(dir, "session file.jsonl");
    copyFileSync(fixture("session-tool-turns.jsonl"), transcript);
    const r = await runHook(
      {
        session_id: "00000000-0000-4000-8000-000000000001",
        transcript_path: transcript,
        hook_event_name: "Stop",
        stop_hook_active: false,
      },
      { env: { AIEDS_CONFIG_DIR: join(dir, "config") } },
    );
    assert.equal(r.code, 0);
    assert.equal(r.stderr, "");
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out), ["systemMessage"]);

    // A fresh account holds this one session, so the account is the session.
    const receipt = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
    const expected = formatReceipt(receipt, { counted: receipt.session.counted, linked: false });
    assert.equal(out.systemMessage, expected);

    // And the number in it is the library's number with the cache reads left
    // out (turn 2: 7 plain, 27,450 cache read, 390 out).
    const lib = disclosureFromResponse({
      provider: "Anthropic",
      model: "claude-sonnet-4-5-20250929",
      inputTokenBreakdown: { plain: 7, cacheCreation: 0, cacheRead: 0 },
      outputTokens: 390,
    });
    const first = out.systemMessage.split("\n")[0];
    assert.ok(first.includes(`${formatEnergy(lib.energyWh)}, `), first);
    assert.ok(first.includes(`${formatCarbon(lib.carbonGrams)}, `), first);
    assert.ok(first.endsWith(`${formatTreeTime(lib.treeTimeMinutes)} tree-time`), first);
    assert.doesNotMatch(r.stdout, CANARIES);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -- the local account total ---------------------------------------------------

const C = (energyWh) => ({
  energyWh,
  carbonGrams: (energyWh / 1000) * 429,
  waterMl: energyWh * 4.88,
  treeTimeMinutes: ((energyWh / 1000) * 429) / 21000 * 525600,
});

test("account: per-session totals add up, and recording a session again never double counts", () => {
  const dir = tmp();
  try {
    const env = { AIEDS_CONFIG_DIR: join(dir, "config") };
    const a = accountKey("claude", "00000000-0000-4000-8000-0000000000a1");
    const b = accountKey("claude", "00000000-0000-4000-8000-0000000000b2");
    assert.notEqual(a, b);
    assert.notEqual(accountKey("codex", "x"), accountKey("claude", "x"), "hosts never share an entry");
    recordSession(a, C(10), env);
    recordSession(a, C(10), env);
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 10, "the same session twice is one session");
    recordSession(a, C(25), env);
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 25, "a growing session replaces its own entry");
    recordSession(a, C(5), env);
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 25, "a short read of a lagging file never lowers it");
    recordSession(b, C(4), env);
    const t = accountTotal(loadAccount(env));
    assert.equal(t.counted.energyWh, 29);
    approx(t.counted.carbonGrams, C(29).carbonGrams, "carbon adds");
    approx(t.counted.waterMl, C(29).waterMl, "water adds");
    approx(t.counted.treeTimeMinutes, C(29).treeTimeMinutes, "tree-time adds");
    assert.equal(t.sessions, 2);
    // Pure helpers agree with the file.
    const mem = withSession(withSession({ format: ACCOUNT_FORMAT, since: "", sessions: {} }, a, C(25)), b, C(4));
    assert.equal(accountTotal(mem).counted.energyWh, 29);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account: reset starts from zero, and a running session counts only what it uses after", () => {
  const dir = tmp();
  try {
    const env = { AIEDS_CONFIG_DIR: join(dir, "config") };
    assert.equal(resetAccount(env), 0, "nothing to reset");
    assert.equal(existsSync(accountPath(env)), false, "a reset with no total writes nothing");
    const a = accountKey("claude", "s-a");
    recordSession(a, C(10), env);
    recordSession(accountKey("claude", "s-b"), C(3), env);
    assert.equal(resetAccount(env), 2);
    const after = accountTotal(loadAccount(env));
    assert.equal(after.counted.energyWh, 0);
    assert.equal(after.sessions, 0);
    recordSession(a, C(10), env);
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 0, "the same session at the same size adds nothing");
    recordSession(a, C(14), env);
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 4, "only the use after the reset");
    recordSession(accountKey("claude", "s-new"), C(2), env);
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account: written atomically, a torn or foreign file reads as empty, and no temp file is left", () => {
  const dir = tmp();
  try {
    const env = { AIEDS_CONFIG_DIR: join(dir, "config") };
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(accountPath(env), '{"format":"rk-account-total/1","sessions":{"ab');
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 0, "a torn file is empty, not fatal");
    writeFileSync(accountPath(env), JSON.stringify({ format: "something-else", sessions: { ["0".repeat(32)]: { energyWh: 99 } } }));
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 0, "a foreign file is not read");
    recordSession(accountKey("claude", "s"), C(7), env);
    const stored = JSON.parse(readFileSync(accountPath(env), "utf8"));
    assert.equal(stored.format, ACCOUNT_FORMAT);
    assert.deepEqual(readdirSync(join(dir, "config")).sort(), ["account-total.json"], "no .tmp or lock left behind");
    // Keys that are not the 32-hex hash are dropped, so nothing else hides in the file.
    stored.sessions["not-a-hash"] = { energyWh: 1000 };
    writeFileSync(accountPath(env), JSON.stringify(stored));
    assert.equal(accountTotal(loadAccount(env)).counted.energyWh, 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account: lives in this user's own config folder and holds numbers and hashes only", async () => {
  const dir = tmp();
  try {
    const env = { AIEDS_CONFIG_DIR: join(dir, "config") };
    assert.equal(dirname(accountPath(env)), configDir(env));
    assert.equal(dirname(accountPath({ APPDATA: join(dir, "roaming") })), configDir({ APPDATA: join(dir, "roaming") }));
    const id = "00000000-0000-4000-8000-0000000000c3";
    const r = await runHook({ session_id: id, transcript_path: fixture("session-owner-sample.jsonl") }, { env });
    assert.equal(r.code, 0);
    const raw = readFileSync(accountPath(env), "utf8");
    assert.ok(!raw.includes(id), "the session id is never stored");
    assert.doesNotMatch(raw, CANARIES);
    assert.doesNotMatch(raw, /claude|opus|projects|jsonl/i, "no model, host or path names");
    const stored = JSON.parse(raw);
    assert.deepEqual(Object.keys(stored).sort(), ["format", "sessions", "since"]);
    for (const [k, v] of Object.entries(stored.sessions)) {
      assert.match(k, /^[0-9a-f]{32}$/);
      for (const value of Object.values(v)) assert.equal(typeof value, "number");
    }
    // No module that talks to a network touches the account total.
    for (const f of ["syncclient.mjs", "syncflow.mjs", "connect.mjs", "contribute.mjs", "contributeflow.mjs", "receipts.mjs", "wrappers.mjs"]) {
      const body = readFileSync(join(pluginRoot, "scripts", f), "utf8");
      assert.doesNotMatch(body, /account-total|loadAccount|accountTotal|recordSession|accountPath/, f);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account hook: the same session twice is counted once; a second session adds to the account line", async () => {
  const dir = tmp();
  try {
    const env = { AIEDS_CONFIG_DIR: join(dir, "config") };
    const input = (id) => ({ session_id: id, transcript_path: fixture("session-owner-sample.jsonl") });
    const one = JSON.parse((await runHook(input("00000000-0000-4000-8000-0000000000d1"), { env })).stdout).systemMessage;
    const again = JSON.parse((await runHook(input("00000000-0000-4000-8000-0000000000d1"), { env })).stdout).systemMessage;
    assert.equal(again, one, "a repeated Stop for the same session changes nothing");
    const lines = one.split("\n");
    assert.equal(lines[2].replace(/^your account on this computer\s+/, ""), lines[1].replace(/^this session\s+/, ""));
    const two = JSON.parse((await runHook(input("00000000-0000-4000-8000-0000000000d2"), { env })).stdout).systemMessage;
    const receipt = receiptFor(parseTranscript(fixtureText("session-owner-sample.jsonl")));
    const doubled = {
      energyWh: receipt.session.counted.energyWh * 2,
      carbonGrams: receipt.session.counted.carbonGrams * 2,
      waterMl: receipt.session.counted.waterMl * 2,
      treeTimeMinutes: receipt.session.counted.treeTimeMinutes * 2,
    };
    assert.equal(two, formatReceipt(receipt, { counted: doubled, linked: false }));
    assert.equal(accountTotal(loadAccount(env)).sessions, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account hook: once an account is linked the line reads your account", async () => {
  const dir = tmp();
  try {
    const env = { AIEDS_CONFIG_DIR: join(dir, "config") };
    saveConnection({ endpoint: "https://127.0.0.1:9", token: `rkd_${"T".repeat(43)}`, deviceId: "d", connectedAt: "" }, env);
    // AIEDS_SYNC=off keeps the hook from attempting a send; the label is about the link.
    const r = await runHook(
      { session_id: "00000000-0000-4000-8000-0000000000e1", transcript_path: fixture("session-owner-sample.jsonl") },
      { env: { ...env, AIEDS_SYNC: "off" } },
    );
    const text = JSON.parse(r.stdout).systemMessage;
    assert.match(text, /^your account {4}~/m);
    assert.match(text, /^your account so far is /m);
    assert.doesNotMatch(text, /on this computer/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account command: shows the total and where it is kept; reset zeroes it", async () => {
  const dir = tmp();
  try {
    const env = { AIEDS_CONFIG_DIR: join(dir, "config") };
    const empty = await runNode([script, "account"], { env });
    assert.equal(empty.code, 0, empty.stderr);
    assert.match(empty.stdout, /^your account on this computer {2}0 Wh, 0 g CO2e, 0 min tree-time$/m);
    assert.match(empty.stdout, /0 sessions counted\. Kept only on this computer \(.*account-total\.json\)\. This total is never sent anywhere\./);
    await runHook({ session_id: "00000000-0000-4000-8000-0000000000f1", transcript_path: fixture("session-owner-sample.jsonl") }, { env });
    const shown = await runNode([script, "account", "show"], { env });
    assert.match(shown.stdout, /^your account on this computer {2}~60 Wh, ~30 g CO2e, ~0\.3 L water, ~10 h tree-time$/m);
    assert.match(shown.stdout, /^your account on this computer so far is about 5 phone charges, or about 200 m of driving\.$/m);
    assert.match(shown.stdout, /^1 session counted since \d{4}-\d{2}-\d{2}\./m);
    const reset = await runNode([script, "account", "reset"], { env });
    assert.equal(reset.code, 0);
    assert.match(reset.stdout, /starts again from zero \(it had 1 session\)/);
    const after = await runNode([script, "account"], { env });
    assert.match(after.stdout, /^your account on this computer {2}0 Wh/m);
    const bad = await runNode([script, "account", "delete-everything"], { env });
    assert.equal(bad.code, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account: receipt and explain show the total but never change it", async () => {
  const dir = tmp();
  try {
    const env = { AIEDS_CONFIG_DIR: join(dir, "config") };
    const r = await runNode([script, "receipt", "--transcript", fixture("session-owner-sample.jsonl")], { env });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /^your account on this computer {2}~60 Wh/m, "the session is merged in for display");
    const e = await runNode([script, "explain", "--transcript", fixture("session-owner-sample.jsonl")], { env });
    assert.match(e.stdout, /your account on this computer, short receipt count, unrounded:/);
    assert.equal(existsSync(join(dir, "config")), false, "nothing was written");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook: every failure path exits 0 with no output", async () => {
  const dir = tmp();
  try {
    const empty = join(dir, "empty.jsonl");
    writeFileSync(empty, "");
    const garbage = join(dir, "garbage.jsonl");
    writeFileSync(garbage, "{{{ not json\n\u0000\u0001\n");
    const cases = {
      "empty stdin": "",
      "stdin is not JSON": "this is not json",
      "stdin is a JSON array": "[]",
      "stdin is JSON null": "null",
      "no transcript_path": JSON.stringify({ session_id: "s" }),
      "transcript_path is a number": JSON.stringify({ transcript_path: 7 }),
      "transcript does not exist": JSON.stringify({ transcript_path: join(dir, "missing.jsonl") }),
      "transcript_path is a directory": JSON.stringify({ transcript_path: dir }),
      "transcript is empty": JSON.stringify({ transcript_path: empty }),
      "transcript is garbage": JSON.stringify({ transcript_path: garbage }),
    };
    for (const [name, input] of Object.entries(cases)) {
      const r = await runHook(input);
      assert.equal(r.code, 0, `${name}: exit code`);
      assert.equal(r.stdout, "", `${name}: stdout`);
      assert.equal(r.stderr, "", `${name}: stderr`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook: a plugin copy with its vendored library missing still exits 0, silent", async () => {
  const dir = tmp();
  try {
    const copy = join(dir, "plugin copy");
    mkdirSync(copy, { recursive: true });
    cpSync(join(pluginRoot, "scripts"), join(copy, "scripts"), { recursive: true });
    writeFileSync(join(copy, "package.json"), '{"type":"module"}');
    const transcript = join(dir, "t.jsonl");
    copyFileSync(fixture("session-mixed-models.jsonl"), transcript);
    const r = await runNode([join(copy, "scripts", "aieds.mjs"), "hook"], {
      input: JSON.stringify({ transcript_path: transcript }),
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook: receipts can be switched off with AIEDS_RECEIPTS", async () => {
  for (const value of ["off", "0", "false", "OFF", "no"]) {
    const r = await runHook(
      { transcript_path: fixture("session-mixed-models.jsonl") },
      { env: { AIEDS_RECEIPTS: value } },
    );
    assert.equal(r.code, 0, value);
    assert.equal(r.stdout, "", value);
  }
  assert.equal(receiptsEnabled({}), true);
  assert.equal(receiptsEnabled({ AIEDS_RECEIPTS: "on" }), true);
  assert.equal(receiptsEnabled({ AIEDS_RECEIPTS: "off" }), false);
});

test("hook: writes only the local account total unless AIEDS_RECEIPT_LOG is set, then one numeric line", async () => {
  const dir = tmp();
  const cfg = tmp("rk cfg ");
  try {
    const log = join(dir, "aieds log.jsonl");
    const input = {
      session_id: "00000000-0000-4000-8000-000000000002",
      transcript_path: fixture("session-mixed-models.jsonl"),
    };
    const off = await runHook(input, { env: { AIEDS_CONFIG_DIR: cfg } });
    assert.equal(off.code, 0);
    assert.equal(existsSync(log), false);
    assert.deepEqual(readdirSync(dir), []);
    // The one file the hook keeps by default is the account total, in the
    // user's config folder. No sync, contribute or log file appears.
    assert.deepEqual(readdirSync(cfg), ["account-total.json"]);

    const on = await runHook(input, { env: { AIEDS_RECEIPT_LOG: log, AIEDS_CONFIG_DIR: cfg } });
    assert.equal(on.code, 0);
    const lines = readFileSync(log, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.equal(row.session, "00000000-0000-4000-8000-000000000002");
    assert.equal(row.modelCalls, 3);
    assert.equal(typeof row.energyWh, "number");
    assert.doesNotMatch(lines[0], CANARIES);
    assert.deepEqual(
      Object.keys(row).sort(),
      [
        "aiedsVersion", "confidence", "energyWh", "gCO2e", "inputTokens",
        "methodologyVersion", "modelCalls", "models", "outputTokens",
        "provenance", "session", "treeTimeMinutes", "ts",
      ].sort(),
    );
    // The log keeps the ratified count (cache reads at the input rate); the
    // short receipt's count changes only what is printed.
    const ratified = receiptFor(parseTranscript(fixtureText("session-mixed-models.jsonl"))).session;
    assert.equal(row.energyWh, ratified.energyWh);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cfg, { recursive: true, force: true });
  }
});

test("hook: an unwritable log path never changes the exit code or the receipt", async () => {
  const dir = tmp();
  try {
    const r = await runHook(
      { transcript_path: fixture("session-mixed-models.jsonl") },
      { env: { AIEDS_RECEIPT_LOG: join(dir, "no such dir", "x", "log.jsonl") } },
    );
    assert.equal(r.code, 0);
    assert.match(JSON.parse(r.stdout).systemMessage, /^this response {3}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook: waits for a lagging transcript to include the last message", async () => {
  const dir = tmp();
  try {
    const transcript = join(dir, "lag.jsonl");
    const final = "CANARY_LAG_FINAL_MESSAGE";
    const entry = (id, text, out) =>
      JSON.stringify({
        type: "assistant",
        message: {
          id,
          role: "assistant",
          model: "claude-sonnet-4-5",
          content: [{ type: "text", text }],
          usage: { input_tokens: 100, output_tokens: out },
        },
      }) + "\n";
    writeFileSync(
      transcript,
      JSON.stringify({ type: "user", message: { role: "user", content: "CANARY_Q" } }) +
        "\n" +
        entry("msg_one", "CANARY_EARLIER", 10),
    );
    setTimeout(() => appendFileSync(transcript, entry("msg_two", final, 20)), 400);

    const r = await runHook({
      transcript_path: transcript,
      last_assistant_message: final,
    });
    assert.equal(r.code, 0);
    const text = JSON.parse(r.stdout).systemMessage;
    // Both calls (100 in + 10 out, 100 in + 20 out) are in the session energy,
    // and the response is the turn's two calls too.
    const both = disclosureFromResponse({ provider: "Anthropic", model: "claude-sonnet-4-5", inputTokens: 200, outputTokens: 30 });
    const one = disclosureFromResponse({ provider: "Anthropic", model: "claude-sonnet-4-5", inputTokens: 100, outputTokens: 10 });
    assert.notEqual(formatEnergy(both.energyWh), formatEnergy(one.energyWh), "the test can tell one call from two");
    assert.ok(lineOf(text, "this session").includes(` ${formatEnergy(both.energyWh)}, `), text);
    assert.doesNotMatch(text, CANARIES);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hook: a last message that never lands is not waited on forever", async () => {
  const start = Date.now();
  const r = await runHook({
    transcript_path: fixture("session-mixed-models.jsonl"),
    last_assistant_message: "CANARY_NEVER_IN_TRANSCRIPT",
  });
  assert.equal(r.code, 0);
  assert.ok(Date.now() - start < 6000, "bounded wait");
  const all = receiptFor(parseTranscript(fixtureText("session-mixed-models.jsonl"))).session;
  assert.ok(
    lineOf(JSON.parse(r.stdout).systemMessage, "this session").includes(` ${formatEnergy(all.counted.energyWh)}, `),
    "the session line holds all three calls",
  );
});

// -- on-demand commands --------------------------------------------------------

test("receipt command: --transcript prints the same three-scope receipt as the hook", async () => {
  const cfg = tmp("rk cfg ");
  try {
    const r = await runNode([script, "receipt", "--transcript", fixture("session-tool-turns.jsonl")], {
      env: { AIEDS_CONFIG_DIR: cfg },
    });
    assert.equal(r.code, 0);
    const receipt = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
    const expected = formatReceipt(receipt, { counted: receipt.session.counted, linked: false });
    assert.equal(r.stdout.trim(), expected);
    assert.doesNotMatch(r.stdout, CANARIES);
  } finally {
    rmSync(cfg, { recursive: true, force: true });
  }
});

test("receipt command: a session id is validated and found under the config dir", async () => {
  const cfg = tmp("rk cfg ");
  try {
    const id = "00000000-0000-4000-8000-000000000002";
    const projectDir = join(cfg, "projects", "C--some-project");
    mkdirSync(projectDir, { recursive: true });
    copyFileSync(fixture("session-mixed-models.jsonl"), join(projectDir, `${id}.jsonl`));

    assert.equal(
      findTranscript(id, { CLAUDE_CONFIG_DIR: cfg }),
      join(projectDir, `${id}.jsonl`),
    );
    const r = await runNode([script, "receipt", "--session", id], {
      env: { CLAUDE_CONFIG_DIR: cfg },
    });
    assert.equal(r.code, 0);
    const all = receiptFor(parseTranscript(fixtureText("session-mixed-models.jsonl"))).session;
    assert.ok(lineOf(r.stdout, "this session").includes(` ${formatEnergy(all.counted.energyWh)}, `), r.stdout);

    const missing = await runNode(
      [script, "receipt", "--session", "00000000-0000-4000-8000-0000000000ff"],
      { env: { CLAUDE_CONFIG_DIR: cfg } },
    );
    assert.match(missing.stdout, /No transcript was found/);
  } finally {
    rmSync(cfg, { recursive: true, force: true });
  }
});

test("explain command prints the explanation and exits 0", async () => {
  const r = await runNode([script, "explain"]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), formatExplanation());
});

// -- Windows paths and path safety ---------------------------------------------

test("paths: session ids that could traverse or break out are refused", () => {
  for (const bad of [
    "", "..", "../x", "..\\x", "a/b", "a\\b", "C:\\x", "x y", "x\u0000", "a".repeat(129),
    undefined, null, 5,
  ]) {
    assert.equal(isSafeSessionId(bad), false, JSON.stringify(bad));
    assert.equal(findTranscript(bad, { CLAUDE_CONFIG_DIR: tmpdir() }), undefined);
  }
  assert.equal(isSafeSessionId("00000000-0000-4000-8000-000000000001"), true);
});

test("paths: ~ expands with either separator and plain paths pass through", () => {
  assert.notEqual(expandHome("~/x"), "~/x");
  assert.notEqual(expandHome("~\\x"), "~\\x");
  assert.equal(expandHome("C:\\Users\\someone\\t.jsonl"), "C:\\Users\\someone\\t.jsonl");
  assert.equal(expandHome("/var/t.jsonl"), "/var/t.jsonl");
  assert.equal(expandHome(undefined), undefined);
});

test("paths: a transcript path with spaces and, on Windows, backslashes works", async () => {
  const dir = tmp("rk path with spaces ");
  try {
    const nested = join(dir, "projects", "C--Users-someone-my repo");
    mkdirSync(nested, { recursive: true });
    const transcript = join(nested, "session.jsonl");
    copyFileSync(fixture("session-mixed-models.jsonl"), transcript);
    const native = process.platform === "win32" ? transcript.replaceAll("/", "\\") : transcript;
    const r = await runHook({ transcript_path: native });
    assert.equal(r.code, 0);
    assert.match(JSON.parse(r.stdout).systemMessage, /^this response {3}/);
    if (process.platform === "win32") {
      assert.ok(native.includes("\\"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -- the plugin on disk --------------------------------------------------------

test("logLine: numbers only, session id only when it is a safe id", () => {
  const receipt = receiptFor(parseTranscript(fixtureText("session-mixed-models.jsonl")));
  const line = JSON.parse(logLine("../../etc/passwd", receipt, new Date(0)));
  assert.equal(line.session, "");
  assert.equal(line.ts, "1970-01-01T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(line), CANARIES);
});

test("manifests: plugin.json, marketplace.json, hooks and skills are consistent", () => {
  const repoRoot = resolve(pluginRoot, "..", "..");
  const plugin = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
  const market = JSON.parse(readFileSync(join(repoRoot, ".claude-plugin", "marketplace.json"), "utf8"));

  assert.equal(market.name, "standard");
  assert.equal(market.owner.name, "Random Knights");
  assert.equal(market.plugins.length, 1);
  const entry = market.plugins[0];
  assert.equal(entry.name, "random-knights");
  assert.equal(plugin.name, entry.name, "entry name and manifest name must match");
  assert.equal(entry.source, "./plugins/random-knights");
  assert.equal(resolve(repoRoot, entry.source), pluginRoot);
  assert.ok(!entry.source.includes(".."));

  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  const pkg = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.version, plugin.version, "package.json and plugin.json versions agree");

  const hooks = JSON.parse(readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8"));
  const stop = hooks.hooks.Stop[0].hooks[0];
  assert.equal(stop.type, "command");
  assert.equal(stop.command, "node");
  assert.deepEqual(stop.args, ["${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs", "hook"]);
  assert.ok(existsSync(join(pluginRoot, "scripts", "aieds.mjs")));
  assert.ok(stop.timeout <= 30, "a short timeout: a receipt must never stall a session");
  assert.deepEqual(Object.keys(hooks.hooks), ["Stop"]);

  for (const skill of ["aieds", "aieds-explain", "aieds-account", "aieds-account-reset"]) {
    const body = readFileSync(join(pluginRoot, "skills", skill, "SKILL.md"), "utf8");
    assert.match(body, new RegExp(`^---\\nname: ${skill}\\n`));
    assert.match(body, /\ndescription: .+\n/);
    assert.match(body, /\ndisable-model-invocation: true\n/);
    assert.match(
      body,
      /\nallowed-tools: 'Bash\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/aieds\.mjs" \*\)'\n/,
    );
  }
  // One command to show the account total, one to reset it, and no arguments
  // passed through from the prompt.
  const show = readFileSync(join(pluginRoot, "skills", "aieds-account", "SKILL.md"), "utf8");
  assert.match(show, /\n!`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/aieds\.mjs" account`\n$/);
  const reset = readFileSync(join(pluginRoot, "skills", "aieds-account-reset", "SKILL.md"), "utf8");
  assert.match(reset, /\n!`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/aieds\.mjs" account reset`\n$/);
  assert.doesNotMatch(show + reset, /ARGUMENTS/);
});

test("no personal paths or secrets in committed plugin files", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(pluginRoot);
  const personal = [/C:\\Users\\/i, /\/Users\/[a-z]/i, /\/home\/[a-z]/i, /\.secrets/i, /api[_-]?key\s*[:=]/i];
  for (const f of files) {
    // This test file names the patterns it forbids.
    if (f.endsWith("receipt.test.mjs")) continue;
    const body = readFileSync(f, "utf8");
    for (const re of personal) {
      assert.doesNotMatch(body, re, `${f} matches ${re}`);
    }
  }
});

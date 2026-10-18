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
  disclose,
  expandHome,
  findTranscript,
  formatCarbon,
  formatEnergy,
  formatExplanation,
  formatReceipt,
  formatSessionReceipt,
  formatWater,
  isSafeSessionId,
  logLine,
  parseTranscript,
  receiptFor,
  receiptsEnabled,
} from "../scripts/core.mjs";

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
      env: { ...process.env, ...env },
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
});

test("receipt: an unlisted model gets the class estimate and says so", () => {
  const { session } = receiptFor(
    parseTranscript(fixtureText("session-mixed-models.jsonl")),
  );
  assert.equal(session.provenance, "unknown");
  const text = formatSessionReceipt(session);
  assert.match(text, /class estimate \(model not in the coefficient table\)/);
  assert.match(text, /acme-llm-1/);
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
  return {
    receipt: formatReceipt(receipt),
    mixedReceipt: formatReceipt(mixed),
    session: formatSessionReceipt(receipt.session),
    explain: formatExplanation(),
  };
};

test("copy: every receipt carries the three required sentences, verbatim", () => {
  assert.deepEqual(REQUIRED_COPY, [
    "Energy and carbon are modeled estimates.",
    "Tree-Time and equivalents are educational comparisons.",
    "Water is a modeled estimate.",
  ]);
  for (const [name, text] of Object.entries(ALL_TEXTS())) {
    for (const sentence of REQUIRED_COPY) {
      assert.ok(text.includes(sentence), `${name} lacks: ${sentence}`);
    }
  }
});

test("copy: the word offset never appears, in output or in shipped text", () => {
  for (const [name, text] of Object.entries(ALL_TEXTS())) {
    assert.doesNotMatch(text, /offset/i, name);
  }
  const shipped = [
    join(pluginRoot, "README.md"),
    join(pluginRoot, "skills", "aieds", "SKILL.md"),
    join(pluginRoot, "skills", "aieds-explain", "SKILL.md"),
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

test("format: energy and carbon use four decimals and promote at a full unit", () => {
  assert.equal(formatEnergy(0.44117), "0.4412 Wh");
  assert.equal(formatEnergy(999.99994), "999.9999 Wh");
  assert.equal(formatEnergy(1500), "1.5000 kWh");
  assert.equal(formatCarbon(0.18926), "0.1893 gCO2e");
  assert.equal(formatCarbon(2500), "2.5000 kgCO2e");
});

test("format: the one-line receipt carries figures, tokens and basis", () => {
  const text = formatReceipt(
    receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl"))),
  );
  assert.ok(!text.includes("\n"), "a hook message is one line");
  assert.match(text, /^AiEDs receipt: \d+\.\d{4} Wh, \d+\.\d{4} gCO2e, [^ ]+ (min|hrs) tree-time \(this response\)\./);
  assert.match(text, /Session: .* \(4 model calls\)\./);
  assert.match(text, /Tokens this response: 27,457 in \(27,450 cache read, 0 cache write\), 390 out\./);
  assert.match(
    text,
    /Basis: AiEDs v2, claude-opus-4-1-20250805, claude-sonnet-4-5-20250929, class estimate, low confidence\./,
  );
});

// -- water (methodology 2.6) ---------------------------------------------------

test("water: the receipt line is the library's, from the same energy", () => {
  const receipt = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
  const { response, session } = receipt;
  assert.deepEqual(response.water, waterFromEnergyWh(response.energyWh));
  assert.equal(formatWater(response), waterLine(waterFromEnergyWh(response.energyWh)));
  assert.equal(response.water.confidence, "low");
  assert.equal(response.water.basis, "US average");
  // Water is linear in energy, so the session is at least the response.
  assert.ok(session.water.waterMl.default >= response.water.waterMl.default);
});

test("water: one line after the carbon figures, with a range and the modeled-estimate words", () => {
  const receipt = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
  const text = formatReceipt(receipt);
  assert.match(
    text,
    /gCO2e, [^ ]+ (min|hrs) tree-time \(this response\)\. Water: about \d+(\.\d+)? mL \(\d+(\.\d+)? to \d+(\.\d+)? mL\), [a-z0-9. ]*teaspoons?\. Modeled estimate\. Session: /,
  );
  assert.ok(text.endsWith("Water is a modeled estimate."), "the third sentence closes the receipt");
  const session = formatSessionReceipt(receipt.session);
  const lines = session.split(/\r?\n/);
  assert.match(lines[1], /^Water: about /, "the session receipt carries its own water line");
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
  assert.equal(formatWater({ water: null }), "");
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
});

// -- the hook as Claude Code runs it -------------------------------------------

test("hook: prints exactly the systemMessage the library-backed formatter builds", async () => {
  const dir = tmp();
  try {
    const transcript = join(dir, "session file.jsonl");
    copyFileSync(fixture("session-tool-turns.jsonl"), transcript);
    const r = await runHook({
      session_id: "00000000-0000-4000-8000-000000000001",
      transcript_path: transcript,
      hook_event_name: "Stop",
      stop_hook_active: false,
    });
    assert.equal(r.code, 0);
    assert.equal(r.stderr, "");
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out), ["systemMessage"]);

    const expected = formatReceipt(receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl"))));
    assert.equal(out.systemMessage, expected);

    // And the number in it is the library's number, to the printed decimals.
    const lib = disclosureFromResponse({
      provider: "Anthropic",
      model: "claude-sonnet-4-5-20250929",
      inputTokenBreakdown: { plain: 7, cacheCreation: 0, cacheRead: 27450 },
      outputTokens: 390,
    });
    assert.ok(out.systemMessage.includes(`${lib.energyWh.toFixed(4)} Wh`));
    assert.ok(out.systemMessage.includes(`${lib.carbonGrams.toFixed(4)} gCO2e`));
    assert.ok(out.systemMessage.includes(`${lib.treeTimeLabel} tree-time`));
    assert.doesNotMatch(r.stdout, CANARIES);
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

test("hook: writes no file unless AIEDS_RECEIPT_LOG is set, then one numeric line", async () => {
  const dir = tmp();
  try {
    const log = join(dir, "aieds log.jsonl");
    const input = {
      session_id: "00000000-0000-4000-8000-000000000002",
      transcript_path: fixture("session-mixed-models.jsonl"),
    };
    const off = await runHook(input);
    assert.equal(off.code, 0);
    assert.equal(existsSync(log), false);
    assert.deepEqual(readdirSync(dir), []);

    const on = await runHook(input, { env: { AIEDS_RECEIPT_LOG: log } });
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
    assert.match(JSON.parse(r.stdout).systemMessage, /^AiEDs receipt: /);
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
    assert.match(text, /\(2 model calls\)/, "the late message is counted");
    assert.match(text, /30 out/);
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
  assert.match(JSON.parse(r.stdout).systemMessage, /\(3 model calls\)/);
});

// -- on-demand commands --------------------------------------------------------

test("receipt command: --transcript prints the session total", async () => {
  const r = await runNode([script, "receipt", "--transcript", fixture("session-tool-turns.jsonl")]);
  assert.equal(r.code, 0);
  const expected = formatSessionReceipt(
    receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl"))).session,
  );
  assert.equal(r.stdout.trim(), expected);
  assert.doesNotMatch(r.stdout, CANARIES);
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
    assert.match(r.stdout, /^AiEDs session receipt: /);

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
    assert.match(JSON.parse(r.stdout).systemMessage, /^AiEDs receipt: /);
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

  for (const skill of ["aieds", "aieds-explain"]) {
    const body = readFileSync(join(pluginRoot, "skills", skill, "SKILL.md"), "utf8");
    assert.match(body, new RegExp(`^---\\nname: ${skill}\\n`));
    assert.match(body, /\ndescription: .+\n/);
    assert.match(body, /\ndisable-model-invocation: true\n/);
    assert.match(
      body,
      /\nallowed-tools: 'Bash\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/aieds\.mjs" \*\)'\n/,
    );
  }
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

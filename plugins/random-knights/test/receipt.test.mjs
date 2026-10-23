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
  formatResponseReceipt,
  formatSessionReceipt,
  formatTokens,
  formatTreeTime,
  formatWater,
  formatWaterDetail,
  sigFigsFor,
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
  assert.match(text, /^estimate, low confidence - .*acme-llm-1 \(not in table\) - AiEDs v2$/m);
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
    explainWithReceipt: formatExplanation(receipt),
  };
};

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
  for (const name of ["receipt", "mixedReceipt", "session"]) {
    const last = texts[name].split("\n").at(-1);
    assert.match(last, /^estimate, low confidence - .* - AiEDs v2$/, name);
    for (const sentence of REQUIRED_COPY) {
      assert.ok(!texts[name].includes(sentence), `${name} repeats the boilerplate: ${sentence}`);
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

test("format: units auto-scale at the thresholds, at the boundary and after rounding", () => {
  assert.equal(formatEnergy(0.44117), "0.44 Wh");
  assert.equal(formatEnergy(999), "1.0 kWh", "999 Wh at two figures rounds up to 1.0 kWh");
  assert.equal(formatEnergy(366.5), "370 Wh");
  assert.equal(formatEnergy(1000), "1.0 kWh");
  assert.equal(formatEnergy(15610.5), "16 kWh");
  assert.equal(formatCarbon(0.18926), "0.19 g CO2e");
  assert.equal(formatCarbon(157.23), "160 g CO2e");
  assert.equal(formatCarbon(999.6), "1.0 kg CO2e");
  assert.equal(formatCarbon(6696.9), "6.7 kg CO2e");
  assert.equal(formatTreeTime(1.1), "1.1 min");
  assert.equal(formatTreeTime(110), "110 min", "under 120 min stays in minutes");
  assert.equal(formatTreeTime(119), "2.0 h", "119 rounds to 120 at two figures, which is hours");
  assert.equal(formatTreeTime(120), "2.0 h");
  assert.equal(formatTreeTime(65.6 * 60), "66 h");
  assert.equal(formatTreeTime(0), "0 min");
});

test("format: two significant figures when low confidence, three otherwise, one decimal at most", () => {
  assert.equal(sigFigsFor({ confidence: "low", provenance: "class-estimated" }), 2);
  assert.equal(sigFigsFor({ confidence: "low", provenance: "vendor-published" }), 2);
  assert.equal(sigFigsFor({ confidence: "high", provenance: "class-estimated" }), 2, "a class estimate is two figures at any confidence");
  assert.equal(sigFigsFor({ confidence: "medium", provenance: "vendor-published" }), 3);
  // The figures from the real receipt the owner captured.
  assert.equal(formatEnergy(366.5105, 2), "370 Wh");
  assert.equal(formatEnergy(366.5105, 3), "367 Wh");
  assert.equal(formatEnergy(15610.5, 3), "15.6 kWh");
  assert.equal(formatCarbon(6696.9, 3), "6.7 kg CO2e", "three figures, but never more than one decimal");
  assert.equal(formatEnergy(1.2345, 3), "1.2 Wh");
  assert.equal(formatEnergy(0.012345, 3), "0.0123 Wh", "below 1 the figures govern");
  // A low-confidence receipt prints no third significant figure anywhere.
  const parsed = parseTranscript(fixtureText("session-tool-turns.jsonl"));
  const line = formatSessionReceipt(receiptFor(parsed).session).split("\n")[0];
  const figures = [...line.matchAll(/(\d+\.?\d*) (?:Wh|kWh|g CO2e|kg CO2e|min|h|mL|L)\b/g)];
  assert.ok(figures.length >= 4, line);
  for (const m of figures) {
    const digits = m[1].replace(".", "").replace(/^0+/, "").replace(/0+$/, "");
    assert.ok(digits.length <= 2, `${m[0]} has more than two significant figures`);
  }
});

test("format: tokens are compact", () => {
  assert.equal(formatTokens(15), "15");
  assert.equal(formatTokens(7322), "7.3k");
  assert.equal(formatTokens(32211), "32.2k");
  assert.equal(formatTokens(540000), "540k");
  assert.equal(formatTokens(999600), "1.00M");
  assert.equal(formatTokens(2077094), "2.08M");
  assert.equal(formatTokens(584000000), "584M");
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

test("format: the cache-heavy receipt from the owner, exactly, four lines, labels in a column", () => {
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
  const text = formatReceipt({ response: disclose(response), session: disclose([...response, ...rest]) });
  assert.equal(
    text,
    [
      "this response   370 Wh - 160 g CO2e - 66 h tree-time - ~1.8 L water",
      "session (574)   16 kWh - 6.7 kg CO2e - 2800 h tree-time - ~76 L water",
      "tokens          2.08M in (98% cache read) - 7.3k out",
      "estimate, low confidence - claude-sonnet-5-5 - AiEDs v2",
    ].join("\n"),
  );
});

test("format: a tiny response with no cache has no tokens line, and the scopes are on separate lines", () => {
  const one = callsOf(1, { input_tokens: 15, output_tokens: 6 });
  const text = formatReceipt({ response: disclose(one), session: disclose(one) });
  assert.equal(
    text,
    [
      "this response   0.0068 Wh - 0.0029 g CO2e - 0.073 min tree-time - ~0.033 mL water",
      "session (1)     0.0068 Wh - 0.0029 g CO2e - 0.073 min tree-time - ~0.033 mL water",
      "estimate, low confidence - claude-sonnet-5-5 - AiEDs v2",
    ].join("\n"),
  );
});

test("format: the tokens line appears at 20 percent cache read and not below", () => {
  const at = (read) =>
    formatResponseReceipt(
      disclose(callsOf(1, { input_tokens: 1000 - read, cache_read_input_tokens: read, output_tokens: 10 })),
    );
  assert.match(at(200), /^tokens {10}1\.0k in \(20% cache read\) - 10 out$/m);
  assert.doesNotMatch(at(199), /^tokens /m);
});

test("format: a long session reads in hours and kilograms", () => {
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
  const text = formatReceipt({ response: disclose(resp), session: disclose([...resp, ...rest]) });
  assert.equal(
    text,
    [
      "this response   73 Wh - 31 g CO2e - 13 h tree-time - ~360 mL water",
      "session (2000)  140 kWh - 62 kg CO2e - 26000 h tree-time - ~700 L water",
      "tokens          400k in (88% cache read) - 5.0k out",
      "estimate, low confidence - claude-sonnet-5-5 - AiEDs v2",
    ].join("\n"),
  );
});

test("format: the receipt carries the tilde water figure and no range", () => {
  const text = formatReceipt(receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl"))));
  assert.match(text, /^this response {3}.* Wh - .* g CO2e - .* tree-time - ~[\d.]+ (mL|L) water$/m);
  assert.match(text, /^session \(4\) {5}/m);
  assert.doesNotMatch(text, / to [\d.]+ (mL|L)|teaspoon/);
  assert.match(text, /^tokens {10}27\.5k in \(100% cache read\) - 390 out$/m);
  assert.match(
    text,
    /^estimate, low confidence - claude-opus-4-1-20250805, claude-sonnet-4-5-20250929 - AiEDs v2$/m,
  );
});

// -- water (methodology 2.6) ---------------------------------------------------

test("water: the receipt figure is the library's, from the same energy, and the detail line keeps the range", () => {
  const receipt = receiptFor(parseTranscript(fixtureText("session-tool-turns.jsonl")));
  const { response, session } = receipt;
  assert.deepEqual(response.water, waterFromEnergyWh(response.energyWh));
  assert.equal(formatWaterDetail(response), waterLine(waterFromEnergyWh(response.energyWh)));
  assert.match(formatWater(response), /^~[\d.]+ (mL|L)$/);
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
  assert.doesNotMatch(text, /This receipt, unrounded/, "no session, no receipt section");
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
    assert.ok(out.systemMessage.includes(`${formatEnergy(lib.energyWh)} - `));
    assert.ok(out.systemMessage.includes(`${formatCarbon(lib.carbonGrams)} - `));
    assert.ok(out.systemMessage.includes(`${formatTreeTime(lib.treeTimeMinutes)} tree-time`));
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
    assert.match(text, /^session \(2\) {5}/m, "the late message is counted");
    // Both calls (100 in + 10 out, 100 in + 20 out) are in the session energy.
    const both = disclosureFromResponse({ provider: "Anthropic", model: "claude-sonnet-4-5", inputTokens: 200, outputTokens: 30 });
    assert.ok(text.includes(`session (2)     ${formatEnergy(both.energyWh)} - `), text);
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
  assert.match(JSON.parse(r.stdout).systemMessage, /^session \(3\) {5}/m);
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
    assert.match(r.stdout, /^session \(3\) {5}/);

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

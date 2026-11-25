// --json on `aieds receipt`, `aieds account` and `aieds explain`: one JSON
// object on stdout, unrounded numbers, never a color byte, and the plain
// output of the same commands unchanged.
//
// The schema test needs ajv. This plugin has no dependencies, so ajv is loaded
// from lib/node_modules, which the plugin tests already require to be
// installed (see vendor-in-sync.test.mjs: cd lib && npm install && npm run build).
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import * as core from "../scripts/core.mjs";
import * as store from "../scripts/store.mjs";
import {
  FACTORS,
  METHODOLOGY_VERSION,
  MODEL_ENERGY_PROFILES,
  MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
  disclosureFromResponse,
  waterFromEnergyWh,
} from "../vendor/lib/dist/index.js";
import { fixture, hermeticEnv, pluginRoot, runCli, tmpDir } from "./helpers.mjs";

const repoRoot = resolve(pluginRoot, "..", "..");
const OWNER = fixture("session-owner-sample.jsonl");
const ESC = "\u001b";
// Every switch that turns color on for the plain commands.
const LOUD = { AIEDS_COLOR: "always", FORCE_COLOR: "1", COLORTERM: "truecolor" };

/** Asserts stdout is exactly one JSON object and a newline, and returns it. */
function oneObject(stdout) {
  assert.ok(stdout.endsWith("\n"), "stdout ends with a newline");
  const body = stdout.slice(0, -1);
  assert.ok(!body.includes("\n"), "stdout is a single line");
  const value = JSON.parse(body);
  assert.equal(typeof value, "object");
  assert.ok(value !== null && !Array.isArray(value), "the value is an object");
  return value;
}

/** Every number in a value, however deep. */
function numbersIn(value, out = []) {
  if (typeof value === "number") out.push(value);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) numbersIn(v, out);
  return out;
}

function ownerReceipt() {
  return core.receiptFor(core.readTranscript(OWNER));
}

// -- receipt --------------------------------------------------------------------

test("receipt --json: one object, exit 0, the documented keys", async () => {
  const dir = tmpDir();
  const r = await runCli(["receipt", "--transcript", OWNER, "--json"], { env: hermeticEnv(dir) });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, "");
  const o = oneObject(r.stdout);
  assert.deepEqual(Object.keys(o), [
    "aiedsVersion",
    "methodologyVersion",
    "host",
    "response",
    "session",
    "account",
    "record",
  ]);
  assert.deepEqual(Object.keys(o.session), [
    "calls",
    "models",
    "tokens",
    "energyWh",
    "carbonGrams",
    "treeTimeMinutes",
    "water",
    "provenance",
    "confidence",
    "noFigure",
    "counted",
  ]);
  assert.equal(o.host, "claude");
  assert.equal(o.aiedsVersion, core.AIEDS_VERSION);
  assert.equal(o.methodologyVersion, METHODOLOGY_VERSION);
  for (const n of numbersIn(o)) assert.ok(Number.isFinite(n));
});

test("receipt --json: the figures are the library's, unrounded", async () => {
  const dir = tmpDir();
  const r = await runCli(["receipt", "--transcript", OWNER, "--json"], { env: hermeticEnv(dir) });
  const o = oneObject(r.stdout);
  const receipt = ownerReceipt();
  assert.deepEqual(o.response, JSON.parse(JSON.stringify(core.figuresJson(receipt.response))));
  assert.deepEqual(o.session, JSON.parse(JSON.stringify(core.figuresJson(receipt.session))));

  // The library asked directly, from the fixture's own counters. The fixture
  // has one model, so the session is one library call.
  const calls = core.readTranscript(OWNER).calls;
  assert.equal(new Set(calls.map((c) => c.model)).size, 1);
  const sum = (field) => calls.reduce((n, c) => n + c.usage[field], 0);
  const breakdown = {
    plain: sum("input_tokens"),
    cacheCreation: sum("cache_creation_input_tokens"),
    cacheRead: sum("cache_read_input_tokens"),
  };
  const request = { provider: "Anthropic", model: calls[0].model, outputTokens: sum("output_tokens") };
  const full = disclosureFromResponse({ ...request, inputTokenBreakdown: breakdown });
  assert.equal(o.session.energyWh, full.energyWh);
  assert.equal(o.session.carbonGrams, full.carbonGrams);
  assert.equal(o.session.treeTimeMinutes, full.treeTimeMinutes);
  assert.equal(o.session.tokens.input, full.inputTokens);
  assert.equal(o.session.tokens.output, full.outputTokens);
  assert.deepEqual(o.session.tokens, {
    input: breakdown.plain + breakdown.cacheCreation + breakdown.cacheRead,
    ...breakdown,
    output: request.outputTokens,
  });
  assert.deepEqual(o.session.water, JSON.parse(JSON.stringify(waterFromEnergyWh(full.energyWh))));
  assert.equal(o.session.provenance, full.provenance);
  assert.equal(o.session.confidence, full.confidence);

  // The short receipt's floor is its own field: the same call with cache reads free.
  const floor = disclosureFromResponse({ ...request, inputTokenBreakdown: { ...breakdown, cacheRead: 0 } });
  assert.equal(o.session.counted.energyWh, floor.energyWh);
  assert.equal(o.session.counted.carbonGrams, floor.carbonGrams);
  assert.equal(o.session.counted.treeTimeMinutes, floor.treeTimeMinutes);
  assert.ok(o.session.energyWh > o.session.counted.energyWh, "the primary figure is the 2.4.1 count");

  // The account in the object is the stored total with this session merged in.
  assert.equal(o.account.linked, false);
  assert.equal(o.account.sessions, 1);
  assert.deepEqual(o.account.counted, {
    energyWh: o.session.counted.energyWh,
    carbonGrams: o.session.counted.carbonGrams,
    waterMl: o.session.counted.waterMl,
    treeTimeMinutes: o.session.counted.treeTimeMinutes,
  });
});

test("receipt --json never changes the stored account total", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  await runCli(["receipt", "--transcript", OWNER, "--json"], { env });
  assert.equal(existsSync(store.accountPath(env)), false);
});

test("receipt --json: a sentence becomes an error object, exit code as without --json", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir, { CLAUDE_CONFIG_DIR: join(dir, "claude") });
  for (const args of [
    ["receipt"],
    ["receipt", "--session", "abc123"],
    ["receipt", "--transcript", join(dir, "missing.jsonl")],
    ["receipt", "--last", "codex"],
  ]) {
    const plain = await runCli(args, { env });
    const json = await runCli([...args, "--json"], { env: { ...env, ...LOUD } });
    assert.equal(json.code, plain.code, args.join(" "));
    assert.equal(json.code, 0);
    const o = oneObject(json.stdout);
    assert.deepEqual(Object.keys(o), ["error"]);
    assert.equal(`${o.error}\n`, plain.stdout, "the error is the sentence the command prints");
  }
});

// -- account --------------------------------------------------------------------

test("account --json: the total as the store keeps it", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  const empty = await runCli(["account", "--json"], { env });
  assert.equal(empty.code, 0);
  const e = oneObject(empty.stdout);
  assert.deepEqual(Object.keys(e), [
    "aiedsVersion",
    "methodologyVersion",
    "sessions",
    "since",
    "linked",
    "counted",
    "file",
  ]);
  assert.equal(e.sessions, 0);
  assert.equal(e.since, null);
  assert.equal(e.linked, false);
  assert.deepEqual(e.counted, { energyWh: 0, carbonGrams: 0, waterMl: 0, treeTimeMinutes: 0 });
  assert.equal(e.file, store.accountPath(env));

  const counted = ownerReceipt().session.counted;
  store.recordSession(store.accountKey("claude", "json-test-session"), counted, env);
  const total = store.accountTotal(store.loadAccount(env));
  const r = await runCli(["account", "--json"], { env });
  const o = oneObject(r.stdout);
  assert.equal(o.sessions, 1);
  assert.equal(o.since, total.since);
  assert.deepEqual(o.counted, total.counted);
  assert.equal(o.counted.energyWh, counted.energyWh);
  assert.equal(o.aiedsVersion, core.AIEDS_VERSION);
  assert.equal(o.methodologyVersion, METHODOLOGY_VERSION);

  const shown = oneObject((await runCli(["account", "show", "--json"], { env })).stdout);
  assert.deepEqual(shown, o);
});

test("account --json: reset and a bad subcommand answer in JSON with the same exit codes", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  store.recordSession(store.accountKey("claude", "json-test-session"), ownerReceipt().session.counted, env);

  const bad = await runCli(["account", "bogus", "--json"], { env });
  assert.equal(bad.code, 2);
  assert.equal(bad.code, (await runCli(["account", "bogus"], { env })).code);
  assert.deepEqual(Object.keys(oneObject(bad.stdout)), ["error"]);

  const reset = await runCli(["account", "reset", "--json"], { env });
  assert.equal(reset.code, 0);
  assert.deepEqual(oneObject(reset.stdout), { reset: true, sessionsBefore: 1 });
  assert.equal(oneObject((await runCli(["account", "--json"], { env })).stdout).sessions, 0);
});

// -- explain --------------------------------------------------------------------

test("explain --json: the constants, formulas and sources as data", async () => {
  const dir = tmpDir();
  const r = await runCli(["explain", "--json"], { env: hermeticEnv(dir) });
  assert.equal(r.code, 0);
  const o = oneObject(r.stdout);
  assert.deepEqual(Object.keys(o), [
    "aiedsVersion",
    "methodologyVersion",
    "impactModelVersion",
    "formulas",
    "constants",
    "water",
    "coefficients",
    "anyOtherModel",
    "confidence",
    "notes",
    "fullText",
    "receipt",
    "account",
  ]);
  assert.equal(o.receipt, null);
  assert.equal(o.account, null);
  assert.equal(o.methodologyVersion, METHODOLOGY_VERSION);
  assert.equal(o.impactModelVersion, FACTORS.impactModelVersion);
  assert.equal(o.constants.gridIntensityGramsCo2ePerKWh, MODELED_GRID_INTENSITY_GRAMS_PER_KWH);
  assert.equal(o.water.siteWueLPerKWh.value, FACTORS.water.siteWue.value);
  assert.equal(o.water.gridWaterLPerKWh.high, FACTORS.water.gridWaterIntensity.high);
  assert.deepEqual(o.formulas.water, [...FACTORS.water.formula]);
  assert.deepEqual(o.notes, [...core.REQUIRED_COPY]);
  assert.equal(o.coefficients.length, MODEL_ENERGY_PROFILES.length);
  MODEL_ENERGY_PROFILES.forEach((p, i) => {
    assert.deepEqual(o.coefficients[i], {
      matchPrefixes: [...p.matchPrefixes],
      whPer1kIn: p.whPer1kIn,
      whPer1kOut: p.whPer1kOut,
      pue: p.pue,
      provenance: p.confidence,
      source: p.citation,
    });
  });

  // Everything the object says is also in the text `aieds explain` prints.
  const text = core.formatExplanation();
  for (const f of [...o.formulas.response, ...o.formulas.water]) assert.ok(text.includes(f), f);
  for (const c of [...o.coefficients, o.anyOtherModel]) assert.ok(text.includes(c.source));
  assert.ok(text.includes(o.water.source));
  assert.ok(text.includes(o.fullText));
});

test("explain --json with a transcript adds that receipt's unrounded figures", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  const o = oneObject((await runCli(["explain", "--transcript", OWNER, "--json"], { env })).stdout);
  const receipt = ownerReceipt();
  assert.deepEqual(o.receipt, {
    response: JSON.parse(JSON.stringify(core.figuresJson(receipt.response))),
    session: JSON.parse(JSON.stringify(core.figuresJson(receipt.session))),
  });
  assert.equal(o.account.sessions, 1);
  assert.equal(o.account.counted.energyWh, receipt.session.counted.energyWh);

  // A session that cannot be found leaves the formulas alone, as without --json.
  const none = oneObject((await runCli(["explain", "--session", "abc123", "--json"], { env })).stdout);
  assert.equal(none.receipt, null);
  assert.equal(none.account, null);
});

// -- no color, ever -------------------------------------------------------------

test("--json output has no ESC byte, even with color forced on", async () => {
  const dir = tmpDir();
  const env = { ...hermeticEnv(dir), ...LOUD };
  // The switches do color the plain receipt, so the check below means something.
  const colored = await runCli(["receipt", "--transcript", OWNER], { env });
  assert.ok(colored.stdout.includes(ESC), "the plain receipt is colored under these switches");
  for (const args of [
    ["receipt", "--transcript", OWNER, "--json"],
    ["account", "--json"],
    ["account", "bogus", "--json"],
    ["explain", "--json"],
    ["explain", "--transcript", OWNER, "--json"],
    ["receipt", "--json"],
  ]) {
    const r = await runCli(args, { env });
    assert.ok(!r.stdout.includes(ESC), `${args.join(" ")} printed an ESC byte`);
    assert.ok(!r.stderr.includes(ESC));
    oneObject(r.stdout);
  }
});

// -- the plain output did not move ------------------------------------------------

// Captured from `aieds receipt --transcript session-owner-sample.jsonl` on the
// commit before --json existed, with an empty account.
const OWNER_RECEIPT_BEFORE = [
  "AiEDs energy receipt",
  "                               energy  carbon      water   tree-time",
  "this response                  ~50 Wh  ~20 g CO2e  ~0.2 L  ~8 h",
  "this session                   ~60 Wh  ~30 g CO2e  ~0.3 L  ~10 h",
  "your account on this computer  ~60 Wh  ~30 g CO2e  ~0.3 L  ~10 h",
  "",
  "Your account so far is about 5 phone charges, or about 200 m of driving.",
  "",
  "A guess, not a measurement. Cached text counted as free.",
  "",
].join("\n");

test("without --json, receipt, account and explain print what they printed before", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);

  const receipt = await runCli(["receipt", "--transcript", OWNER], { env });
  assert.equal(receipt.code, 0);
  assert.equal(receipt.stdout, OWNER_RECEIPT_BEFORE);

  // Likewise captured from `aieds account` before --json existed; only the
  // file path differs from run to run.
  const account = await runCli(["account"], { env });
  assert.equal(account.code, 0);
  assert.equal(
    account.stdout,
    [
      "AiEDs energy receipt",
      "                               energy  carbon    water  tree-time",
      "your account on this computer  0 Wh    0 g CO2e         0 min",
      "",
      "Your account so far is less than one phone charge, or less than 1 m of driving.",
      "",
      "A guess, not a measurement. Cached text counted as free.",
      `0 sessions counted. Kept only on this computer (${store.accountPath(env)}). This total is never sent anywhere.`,
      "",
    ].join("\n"),
  );

  const explain = await runCli(["explain"], { env });
  assert.equal(explain.code, 0);
  assert.equal(explain.stdout, `${core.formatExplanation()}\n`);

  const parsed = core.readTranscript(OWNER);
  const r = core.receiptFor(parsed);
  const total = store.accountTotal(
    store.withSession(store.loadAccount(env), store.accountKey("claude", "session-owner-sample"), r.session.counted),
  );
  const withSession = await runCli(["explain", "--transcript", OWNER], { env });
  assert.equal(withSession.stdout, `${core.formatExplanation(r, { ...total, linked: false })}\n`);
});

// -- the disclosure record ----------------------------------------------------------

function schemaValidator() {
  const libPackage = join(repoRoot, "lib", "package.json");
  const require = createRequire(libPackage);
  let ajvModule;
  let formatsModule;
  try {
    ajvModule = require("ajv/dist/2020.js");
    formatsModule = require("ajv-formats");
  } catch {
    assert.fail("ajv is not installed under lib/node_modules; run: cd lib && npm install");
  }
  const Ajv2020 = ajvModule.Ajv2020 ?? ajvModule.default ?? ajvModule;
  const addFormats = formatsModule.default ?? formatsModule;
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(join(repoRoot, "spec", "aieds.schema.json"), "utf8"));
  return ajv.compile(schema);
}

test("receipt --json: `record` validates against spec/aieds.schema.json", async () => {
  const validate = schemaValidator();
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  for (const name of [
    "session-owner-sample.jsonl",
    "session-mixed-models.jsonl",
    "session-tool-turns.jsonl",
    "codex-real-0.162.1.jsonl",
    "grok-real-1.0.50.jsonl",
  ]) {
    const r = await runCli(["receipt", "--transcript", fixture(name), "--json"], { env });
    assert.equal(r.code, 0, name);
    const o = oneObject(r.stdout);
    assert.ok(o.record !== null, `${name} has a record`);
    assert.ok(
      validate(o.record),
      `${name}: ${(validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; ")}`,
    );
    // The record is the session's 2.4.1 count in the schema's units.
    assert.equal(o.record.energyKWh, o.session.energyWh / 1000);
    assert.equal(o.record.gCO2e, o.session.carbonGrams);
    assert.equal(o.record.compute.tokens, o.session.tokens.input + o.session.tokens.output);
    assert.equal(o.record.methodologyVersion, o.methodologyVersion);
    assert.ok(
      Math.abs(o.record.gCO2e - o.record.energyKWh * o.record.gridIntensity.gCO2ePerKWh) < 1e-9,
      "gCO2e is energyKWh x grid intensity",
    );
    assert.ok(Math.abs(o.record.water.waterL * 1000 - o.session.water.waterMl.default) < 1e-9);
    assert.ok(!JSON.stringify(o.record).includes(name.replace(/\.jsonl$/, "")), "the id is a hash, not the session id");
  }
  // The validator does reject: the same record with a field the schema does not have.
  const o = oneObject((await runCli(["receipt", "--transcript", OWNER, "--json"], { env })).stdout);
  assert.equal(validate({ ...o.record, counted: o.session.counted }), false);
});

test("a session file with no times gives no record, never an invented window", () => {
  const calls = core.readTranscript(OWNER).calls;
  assert.match(core.windowOfCalls(calls), /^PT\d+S$/);
  assert.equal(core.windowOfCalls(calls.map((c) => ({ ...c, tsMs: 0 }))), undefined);
  assert.equal(core.windowOfCalls([{ tsMs: 1000 }, { tsMs: 61500 }]), "PT61S");
  const receipt = ownerReceipt();
  assert.equal(core.receiptJson(receipt, undefined, { host: "claude" }).record, null);
  assert.equal(core.receiptJson(receipt, undefined, { host: "claude" }).account, null);
});

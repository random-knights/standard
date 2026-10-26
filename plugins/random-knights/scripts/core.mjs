// AiEDs receipt core for the Random Knights Claude Code plugin.
//
// Pure functions, no network, no writes. Reads a Claude Code session transcript
// (JSONL), sums the token usage the transcript records, and turns it into an
// AiEDs receipt with the AiEDs reference library. The arithmetic is not
// restated here: every energy, carbon and Tree-Time figure comes from
// disclosureFromResponse() and treeTimeLabel() in the vendored copy of
// lib/dist (see vendor/README.md), so a receipt agrees with the standard to the
// number.
//
// What is read from the transcript: the model name, the message id, and the
// four token counters of each assistant message. Prompt and response text are
// never stored, never printed and never logged. The single in-memory use of
// text is the lag check in textOfLastAssistant(), which compares one string to
// the string the hook was handed and then discards it.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseSessionText } from "./hosts.mjs";
import { timeMs } from "./hosts/util.mjs";

import {
  AIEDS_VERSION,
  CAR_DRIVING_GRAMS_CO2E_PER_KM,
  EDUCATIONAL_COMPARISON_COPY,
  FACTORS,
  MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR,
  METHODOLOGY_VERSION,
  MINUTES_PER_YEAR,
  MODEL_ENERGY_PROFILES,
  MODELED_ESTIMATE_COPY,
  MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
  PHONE_CHARGE_WH,
  UNKNOWN_MODEL_PROFILE,
  WATER_MODELED_ESTIMATE_COPY,
  disclosureFromResponse,
  energyProfileForModel,
  treeTimeLabel,
  waterFromEnergyWh,
  waterLine,
} from "../vendor/lib/dist/index.js";

export const REQUIRED_COPY = Object.freeze([
  MODELED_ESTIMATE_COPY,
  EDUCATIONAL_COMPARISON_COPY,
  WATER_MODELED_ESTIMATE_COPY,
]);

// -- Transcript parsing --------------------------------------------------------

const NUMBER_FIELDS = [
  "input_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "output_tokens",
];

function count(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function isRealUserPrompt(entry) {
  if (entry.type !== "user" || entry.isMeta === true) return false;
  if (entry.isSidechain === true) return false;
  const content = entry.message?.content;
  if (typeof content === "string") return true;
  if (!Array.isArray(content)) return false;
  // A tool result comes back as a "user" entry. It is not a new prompt.
  return content.some((block) => block && block.type !== "tool_result");
}

function textOfEntry(entry) {
  const content = entry.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

/**
 * Parses a transcript's JSONL text.
 *
 * Returns the model calls in order of first appearance, one per API message
 * id. Claude Code writes one JSONL line per content block, each repeating the
 * message's usage, and a streamed message's output counter grows as it
 * streams, so lines sharing an id are merged by taking the largest value of
 * each counter. Malformed lines (a partially flushed last line, for example)
 * are skipped, never fatal.
 */
export function parseTranscript(jsonlText) {
  const byId = new Map();
  const order = [];
  let turn = 0;
  let lastAssistantText = "";

  for (const line of String(jsonlText).split(/\r?\n/)) {
    if (line.length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry === null || typeof entry !== "object") continue;

    if (isRealUserPrompt(entry)) {
      turn += 1;
      continue;
    }

    const message = entry.message;
    const isAssistant =
      entry.type === "assistant" || message?.role === "assistant";
    if (!isAssistant || message === null || typeof message !== "object") {
      continue;
    }

    const text = textOfEntry(entry);
    if (text.length > 0) lastAssistantText = text;

    const usage = message.usage;
    if (usage === null || typeof usage !== "object") continue;
    // Claude Code writes zero-usage placeholders for local errors and
    // interrupted turns. They carry no model call.
    if (message.model === "<synthetic>" || entry.isApiErrorMessage === true) {
      continue;
    }

    const id =
      (typeof message.id === "string" && message.id) ||
      (typeof entry.requestId === "string" && entry.requestId) ||
      (typeof entry.request_id === "string" && entry.request_id) ||
      (typeof entry.uuid === "string" && entry.uuid) ||
      `line-${order.length}`;

    let call = byId.get(id);
    if (call === undefined) {
      call = {
        id,
        model: typeof message.model === "string" ? message.model : "",
        tsMs: 0,
        turn,
        usage: {
          input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 0,
        },
      };
      byId.set(id, call);
      order.push(id);
    }
    call.tsMs = Math.max(call.tsMs, timeMs(entry.timestamp));
    if (call.model === "" && typeof message.model === "string") {
      call.model = message.model;
    }
    for (const field of NUMBER_FIELDS) {
      call.usage[field] = Math.max(call.usage[field], count(usage[field]));
    }
  }

  return {
    calls: order.map((id) => byId.get(id)),
    lastTurn: turn,
    lastAssistantText,
    host: "claude",
  };
}

/**
 * Parses a session file from any supported host. The host is recognized from
 * the file's own records (see sniffFormat), not from where it was found.
 * An unrecognized file yields no calls, so the caller prints nothing.
 */
export function parseSession(text) {
  return parseSessionText(text, parseTranscript);
}

// -- Receipt -------------------------------------------------------------------

const PROVENANCE_STRENGTH = [
  "measured",
  "vendor-published",
  "class-estimated",
  "synthetic",
  "unknown",
];

function weakest(provenances) {
  let idx = 0;
  for (const p of provenances) {
    idx = Math.max(idx, Math.max(0, PROVENANCE_STRENGTH.indexOf(p)));
  }
  return PROVENANCE_STRENGTH[idx];
}

function sumUsage(calls) {
  const total = {
    plain: 0,
    cacheCreation: 0,
    cacheRead: 0,
    output: 0,
    calls: calls.length,
  };
  for (const c of calls) {
    total.plain += c.usage.input_tokens;
    total.cacheCreation += c.usage.cache_creation_input_tokens;
    total.cacheRead += c.usage.cache_read_input_tokens;
    total.output += c.usage.output_tokens;
    // A host that reports one record per prompt (Grok) says how many model
    // calls it covers. Claude and Codex report one record per call.
    if (typeof c.count === "number" && c.count > 1) total.calls += c.count - 1;
  }
  return total;
}

/**
 * Builds a disclosure for a set of calls. Calls are grouped by model so each
 * model is charged with its own coefficient, then the library's per-model
 * results are added. Energy, carbon and Tree-Time are all linear in tokens, so
 * grouping by model changes nothing but which coefficient applies.
 */
export function disclose(calls) {
  const groups = new Map();
  for (const c of calls) {
    // The provider is only a label on the library's result; the coefficient is
    // chosen by model name. Claude Code records no provider, so it is Anthropic.
    const provider = typeof c.provider === "string" ? c.provider : "Anthropic";
    const key = `${provider}\u0000${c.model}`;
    const g = groups.get(key) ?? { model: c.model, provider, calls: [] };
    g.calls.push(c);
    groups.set(key, g);
  }

  let energyWh = 0;
  let carbonGrams = 0;
  let treeTimeMinutes = 0;
  // The short receipt's count (proposed, see methodology 2.7): the same
  // library call with the cache-read tokens left out, so they count as free.
  const counted = { energyWh: 0, carbonGrams: 0, treeTimeMinutes: 0 };
  const provenances = [];
  const models = [];
  let allInTable = true;
  // Models with no published figure: not in the table, or in it as "unknown".
  const noFigure = [];

  for (const g of groups.values()) {
    const u = sumUsage(g.calls);
    const request = {
      provider: g.provider,
      model: g.model || undefined,
      inputTokenBreakdown: {
        plain: u.plain,
        cacheCreation: u.cacheCreation,
        cacheRead: u.cacheRead,
      },
      outputTokens: u.output,
    };
    const d = disclosureFromResponse(request);
    energyWh += d.energyWh;
    carbonGrams += d.carbonGrams;
    treeTimeMinutes += d.treeTimeMinutes;
    const free = disclosureFromResponse({
      ...request,
      inputTokenBreakdown: { ...request.inputTokenBreakdown, cacheRead: 0 },
    });
    counted.energyWh += free.energyWh;
    counted.carbonGrams += free.carbonGrams;
    counted.treeTimeMinutes += free.treeTimeMinutes;
    provenances.push(d.provenance);
    models.push(g.model || "unknown");
    const inTable = energyProfileForModel(g.model || undefined).matchPrefixes.length > 0;
    if (!inTable) allInTable = false;
    if (!inTable || d.provenance === "unknown") noFigure.push(g.model || "unknown model");
  }

  const t = sumUsage(calls);
  return {
    aiedsVersion: AIEDS_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    calls: t.calls,
    models,
    tokens: {
      input: t.plain + t.cacheCreation + t.cacheRead,
      plain: t.plain,
      cacheCreation: t.cacheCreation,
      cacheRead: t.cacheRead,
      output: t.output,
    },
    energyWh,
    carbonGrams,
    treeTimeMinutes,
    treeTimeLabel: treeTimeLabel(treeTimeMinutes),
    // Water is linear in energy (methodology 2.6), so it is taken from the
    // summed energy. The library's estimate carries the range and the basis.
    water: waterFromEnergyWh(energyWh),
    provenance: calls.length === 0 ? "unknown" : weakest(provenances),
    // True when every model has its own row in the coefficient table, even a
    // row whose provenance is "unknown" (Grok has one).
    modelsInTable: calls.length > 0 && allInTable,
    noFigure: [...new Set(noFigure)],
    confidence: "low",
    // What the short receipt prints. The fields above are the ratified 2.4.1
    // count and stay what the log, sync and `aieds explain` report.
    counted: countedFigures(counted),
  };
}

/**
 * Adds water to a set of short-receipt figures. Water is linear in energy
 * (methodology 2.6), so it is taken from the summed energy.
 */
function countedFigures({ energyWh, carbonGrams, treeTimeMinutes }) {
  const water = waterFromEnergyWh(energyWh);
  return {
    energyWh,
    carbonGrams,
    treeTimeMinutes,
    waterMl: water ? water.waterMl.default : 0,
  };
}

/** Receipt for a parsed transcript: latest response (turn) and the session. */
export function receiptFor(parsed) {
  const latest = parsed.calls.filter((c) => c.turn === parsed.lastTurn);
  return {
    response: disclose(latest),
    session: disclose(parsed.calls),
  };
}

// -- Formatting ----------------------------------------------------------------
//
// ONE formatter. The Claude Code hook, `aieds receipt`, the Ollama and
// chat-completion wrappers, the Codex, Grok and Copilot hooks and the npm
// `aieds` command (a staged copy of this directory) all print through
// receiptLines() below, so rounding and unit scaling live in exactly one place.
// This is presentation only: every figure is read from the disclosure the
// library computed, and `aieds explain` prints the unrounded values.
//
// The short receipt (owner requirements 2026-10-26, PROPOSED in methodology
// section 2.7, not yet ratified):
//   - Three scopes, one line each: this response, this session, your account.
//     Each line has energy, carbon, water and tree-time. A wrapper or Copilot
//     receipt has no session, so it has the response line only.
//   - Cache-read tokens count as free. Plain input, cache writes and output
//     are charged at the profile coefficients with PUE, as before. That is a
//     floor, an understatement; `aieds explain` prints both counts.
//   - One significant figure with a "~", because the confidence is low and a
//     second figure would claim a precision the estimate does not have.
//   - Units step up so the number stays small: Wh, kWh, MWh; g, kg, t CO2e;
//     mL, L (from 100 mL, so 230 mL reads ~0.2 L); min, h, days, years.
//     Thousands separators past 999.
//   - One line of comparisons from the account total (phone charges and km of
//     driving, the standard's own constants), and one line of plain basis.

/** "3,000" from 3000. Integers only. */
function withSeparators(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Rounds to one significant figure. Zero, negative or not a number gives 0. */
export function oneFigure(x) {
  if (!Number.isFinite(x) || x <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  // toFixed first: 0.95 / 0.1 is 9.4999... in binary and must round as 9.5.
  return Math.round(Number((x / p).toFixed(9))) * p;
}

/** The text of a one-figure number: "50", "0.2", "3,000". */
export function oneFigureText(x) {
  const r = oneFigure(x);
  if (r === 0) return "0";
  const e = Math.floor(Math.log10(r) + 1e-9);
  return e >= 0 ? withSeparators(r) : r.toFixed(-e);
}

/**
 * Formats a value in the right unit at one figure. `steps` is ascending
 * [{ unit, perBase, limit, one? }]; the value moves up a step once it reaches
 * the limit of the step below. The check is repeated on the rounded figure, so
 * 960 Wh reads "~1 kWh", never "~1,000 Wh". `one` is the singular unit word.
 */
function approx(base, steps) {
  if (!Number.isFinite(base) || base <= 0) return `0 ${steps[0].unit}`;
  let i = 0;
  while (i < steps.length - 1 && base >= steps[i].limit) i += 1;
  while (i < steps.length - 1 && oneFigure(base / steps[i].perBase) * steps[i].perBase >= steps[i].limit) {
    i += 1;
  }
  const text = oneFigureText(base / steps[i].perBase);
  const unit = text === "1" && steps[i].one ? steps[i].one : steps[i].unit;
  return `~${text} ${unit}`;
}

const ENERGY_STEPS = [
  { unit: "Wh", perBase: 1, limit: 1000 },
  { unit: "kWh", perBase: 1e3, limit: 1e6 },
  { unit: "MWh", perBase: 1e6, limit: Infinity },
];
const CARBON_STEPS = [
  { unit: "g CO2e", perBase: 1, limit: 1000 },
  { unit: "kg CO2e", perBase: 1e3, limit: 1e6 },
  { unit: "t CO2e", perBase: 1e6, limit: Infinity },
];
const WATER_STEPS = [
  { unit: "mL", perBase: 1, limit: 100 },
  { unit: "L", perBase: 1e3, limit: Infinity },
];
const MIN_PER_DAY = 60 * 24;
const TREE_STEPS = [
  { unit: "min", perBase: 1, limit: 60 },
  { unit: "h", perBase: 60, limit: 48 * 60 },
  { unit: "days", one: "day", perBase: MIN_PER_DAY, limit: 365 * MIN_PER_DAY },
  { unit: "years", one: "year", perBase: 365 * MIN_PER_DAY, limit: Infinity },
];
const KM_STEPS = [
  { unit: "m", perBase: 1, limit: 1000 },
  { unit: "km", perBase: 1000, limit: Infinity },
];

export function formatEnergy(wh) {
  return approx(wh, ENERGY_STEPS);
}

export function formatCarbon(grams) {
  return approx(grams, CARBON_STEPS);
}

export function formatWater(ml) {
  return approx(ml, WATER_STEPS);
}

export function formatTreeTime(minutes) {
  return approx(minutes, TREE_STEPS);
}

/**
 * Driving distance from grams of CO2e, at the standard's car constant:
 * "about 10 km", "about 300 m", or "less than 1 m".
 */
export function formatDriving(grams) {
  const meters = (grams / CAR_DRIVING_GRAMS_CO2E_PER_KM) * 1000;
  if (!(meters >= 0.5)) return "less than 1 m";
  return `about ${approx(meters, KM_STEPS).slice(1)}`;
}

/**
 * Phone charges from Wh, at the standard's phone constant: "about 400 phone
 * charges", "about 1 phone charge", or "less than one phone charge".
 */
export function formatPhoneCharges(wh) {
  const n = wh / PHONE_CHARGE_WH;
  if (!(n >= 0.95)) return "less than one phone charge";
  const text = oneFigureText(n);
  return `about ${text} phone ${text === "1" ? "charge" : "charges"}`;
}

function formatCount(n) {
  return n.toLocaleString("en-US");
}

function basisLabel(provenance, models, inTable = false) {
  const modelList = [...new Set(models)].join(", ");
  const known = modelList.length > 0 ? modelList : "unknown model";
  if (provenance === "unknown" && inTable) {
    return `${known}, no published figure for this model, class estimate, low confidence`;
  }
  if (provenance === "unknown") {
    return `${known}, class estimate (model not in the coefficient table), low confidence`;
  }
  if (provenance === "class-estimated") {
    return `${known}, class estimate, low confidence`;
  }
  return `${known}, ${provenance}, low confidence`;
}

/**
 * The water line for a disclosure with its range and the full words, for
 * `aieds explain`; the receipt itself shows only the tilde figure. Empty when
 * there is no usable energy, so no water claim is made (2.6.12).
 */
export function formatWaterDetail(d) {
  return d.water ? waterLine(d.water) : "";
}

const SEP = ", ";
const MIN_LABEL_WIDTH = 16;

/** The account line's name: "your account" only once an account is linked. */
export function accountName(linked) {
  return linked ? "your account" : "your account on this computer";
}

/** One scope line from short-receipt figures ({ energyWh, carbonGrams, waterMl, treeTimeMinutes }). */
function scopeLine(name, c, width) {
  const parts = [formatEnergy(c.energyWh), formatCarbon(c.carbonGrams)];
  // No energy means no water claim (2.6.12), not "0 mL".
  if (c.waterMl > 0) parts.push(`${formatWater(c.waterMl)} water`);
  parts.push(`${formatTreeTime(c.treeTimeMinutes)} tree-time`);
  return name.padEnd(width) + parts.join(SEP);
}

/** The comparisons line, from the account total only. */
export function comparisonLine(account) {
  const c = account.counted;
  return (
    `${accountName(account.linked)} so far is ${formatPhoneCharges(c.energyWh)}, ` +
    `or ${formatDriving(c.carbonGrams)} of driving.`
  );
}

/** The basis line. A model with no published figure says so here. */
function basisLine(d) {
  const lines = ["A guess, not a measurement. Cached text counted as free. Comparisons are for scale only."];
  const missing = d.noFigure ?? [];
  if (missing.length > 0) {
    lines.push(`No published figure for ${missing.join(", ")}, so a general guess is used.`);
  }
  return lines.join(" ");
}

/**
 * The one printer. `scopes` is an ordered list of { name, c } (short-receipt
 * figures each); `basis` is the disclosure the basis line describes;
 * `account`, when present, adds the comparisons line.
 */
function receiptLines(scopes, basis, account) {
  const width = Math.max(MIN_LABEL_WIDTH, ...scopes.map((s) => s.name.length + 2));
  const lines = scopes.map((s) => scopeLine(s.name, s.c, width));
  if (account) lines.push(comparisonLine(account));
  lines.push(basisLine(basis));
  return lines;
}

/**
 * The receipt text a user sees after each response: this response, this
 * session and the account total, one line each, then the comparisons from the
 * account total and one line of basis. `account` is
 * { counted, linked } (see store.mjs accountTotal); without it the receipt has
 * the two transcript scopes only. Plain ASCII.
 */
export function formatReceipt(receipt, account) {
  const { response: r, session: s } = receipt;
  const scopes = [
    { name: "this response", c: r.counted },
    { name: "this session", c: s.counted },
  ];
  if (account) scopes.push({ name: accountName(account.linked), c: account.counted });
  return receiptLines(scopes, s, account).join("\n");
}

/**
 * One-response receipt for the wrappers (Ollama, any OpenAI-compatible chat
 * completion) and the Copilot hook. There is no session to total.
 */
export function formatResponseReceipt(d) {
  return receiptLines([{ name: "this response", c: d.counted }], d).join("\n");
}

/** `aieds account`: the account line, its comparisons, and where it is kept. */
export function formatAccount(account, info = {}) {
  const lines = receiptLines([{ name: accountName(account.linked), c: account.counted }], {}, account);
  const n = info.sessions ?? 0;
  const since = typeof info.since === "string" && info.since.length > 0 ? ` since ${info.since.slice(0, 10)}` : "";
  lines.push(
    `${n} ${n === 1 ? "session" : "sessions"} counted${since}. Kept only on this computer` +
      (info.file ? ` (${info.file})` : "") +
      ". This total is never sent anywhere.",
  );
  return lines.join("\n");
}

/** One scope of `aieds explain`: the unrounded figures, the range, the full counts. */
function unroundedBlock(name, d) {
  const t = d.tokens;
  const lines = [
    `${name}:`,
    `  energy ${d.energyWh} Wh, carbon ${d.carbonGrams} gCO2e, tree-time ${d.treeTimeMinutes} minutes`,
  ];
  if (d.water) {
    const w = d.water.waterMl;
    lines.push(`  water ${w.default} mL (range ${w.low} to ${w.high} mL)`);
    lines.push(`  ${formatWaterDetail(d)}`);
  }
  lines.push(
    `  tokens ${formatCount(t.input)} in (${formatCount(t.plain)} plain, ` +
      `${formatCount(t.cacheCreation)} cache write, ${formatCount(t.cacheRead)} cache read), ` +
      `${formatCount(t.output)} out; ${d.calls} model ${d.calls === 1 ? "call" : "calls"}`,
  );
  lines.push(
    `  basis ${d.aiedsVersion}, methodology ${d.methodologyVersion}; ` +
      basisLabel(d.provenance, d.models, d.modelsInTable),
  );
  if (d.counted) lines.push(countedLine(d.counted));
  return lines;
}

/** The short receipt's count, unrounded, for `aieds explain`. */
function countedLine(c) {
  return (
    `  short receipt (cache reads free): energy ${c.energyWh} Wh, carbon ${c.carbonGrams} gCO2e, ` +
    `water ${c.waterMl} mL, tree-time ${c.treeTimeMinutes} minutes`
  );
}

/**
 * Formulas, constants and coefficient sources, all read from the library.
 * Given a receipt ({ response, session }), also prints what the compact
 * receipt rounds away: the unrounded figures, the water range and the full
 * token counts.
 */
export function formatExplanation(receipt, account) {
  const lines = [];
  lines.push(
    `AiEDs ${FACTORS.impactModelVersion} receipt, methodology ${METHODOLOGY_VERSION}.`,
  );
  lines.push("");
  lines.push("What is measured: the token counters Claude Code records for each model call.");
  lines.push("Prompt and response text are never read into a figure, stored or sent anywhere.");
  lines.push("");
  lines.push("Formulas (methodology section 2.4):");
  // The table names the constants symbolically; print their values so the
  // formula reads as a calculation. The strings themselves are the library's.
  for (const f of FACTORS.responseSurface.formula) {
    lines.push(
      "  " +
        f
          .replace(
            "gridIntensity.responseSurfacePinned",
            String(MODELED_GRID_INTENSITY_GRAMS_PER_KWH),
          )
          .replace(
            "matureReferenceTreeCo2eGramsPerYear",
            String(MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR),
          )
          .replace("minutesPerYear", String(MINUTES_PER_YEAR)),
    );
  }
  lines.push("");
  lines.push(
    "Cached prefill (section 2.4.1): cache-write and cache-read tokens are input and are charged at the full input rate. " +
      "That is a conservative bias, not a measurement.",
  );
  lines.push("");
  lines.push(
    "Short receipt (PROPOSED methodology section 2.7, not ratified): the receipt shown after each response counts " +
      "cache-read tokens as free, and charges plain input, cache writes and output at the coefficients below, with PUE. " +
      "That is a floor, an understatement, until a provider publishes what a cache read costs. " +
      "It rounds to one significant figure. The comparisons come from the account total: " +
      `${PHONE_CHARGE_WH} Wh per phone charge, ${CAR_DRIVING_GRAMS_CO2E_PER_KM} gCO2e per km of driving.`,
  );
  lines.push("");
  lines.push("Water (methodology section 2.6, Table 5): consumed water, inference only.");
  for (const f of FACTORS.water.formula) lines.push("  " + f);
  lines.push(
    `  site ${FACTORS.water.siteWue.value} L/kWh (${FACTORS.water.siteWue.low} to ${FACTORS.water.siteWue.high}), ` +
      `grid ${FACTORS.water.gridWaterIntensity.value} L/kWh (${FACTORS.water.gridWaterIntensity.low} to ${FACTORS.water.gridWaterIntensity.high}), ` +
      `${FACTORS.water.gridBasisDefaultLabel} for any region without its own figure`,
  );
  lines.push("  source: LBNL-2001637 (Shehabi et al. 2024); the range ends cite Microsoft FY25, Siddik et al. 2021 and Li et al. 2025");
  lines.push("  Water covers cooling at the data center and the power plants that supply it.");
  lines.push("  It is not a measure of scarcity: a liter in a wet place and a dry place count the same here.");
  lines.push("");
  lines.push("Constants:");
  lines.push(
    `  grid intensity ${MODELED_GRID_INTENSITY_GRAMS_PER_KWH} gCO2e/kWh (pinned, project modeled constant)`,
  );
  lines.push(
    `  Mature Reference Tree ${MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR} gCO2e/year, ${MINUTES_PER_YEAR} minutes/year`,
  );
  lines.push("");
  lines.push("Coefficients, Wh per 1,000 tokens (input / output), PUE, provenance:");
  for (const p of MODEL_ENERGY_PROFILES) {
    lines.push(
      `  ${p.matchPrefixes.join(", ")}: ${p.whPer1kIn} / ${p.whPer1kOut}, PUE ${p.pue}, ${p.confidence}`,
    );
    lines.push(`    source: ${p.citation}`);
  }
  lines.push(
    `  any other model: ${UNKNOWN_MODEL_PROFILE.whPer1kIn} / ${UNKNOWN_MODEL_PROFILE.whPer1kOut}, PUE ${UNKNOWN_MODEL_PROFILE.pue}, ${UNKNOWN_MODEL_PROFILE.confidence}`,
  );
  lines.push(`    source: ${UNKNOWN_MODEL_PROFILE.citation}`);
  lines.push("");
  lines.push(
    "Confidence is low: a token count is a proxy for energy, not a measurement of it. Water confidence is low by rule.",
  );
  lines.push("Full text: https://standard.rand0m.ai");
  if (receipt) {
    lines.push("");
    lines.push(
      "This receipt, unrounded. The first figures are the ratified count (cache reads at the full input rate); " +
        "the short receipt line is what the receipt rounds to one figure:",
    );
    lines.push(...unroundedBlock("this response", receipt.response));
    lines.push(...unroundedBlock(`session (${receipt.session.calls})`, receipt.session));
  }
  if (account) {
    lines.push("");
    lines.push(`${accountName(account.linked)}, short receipt count, unrounded:`);
    lines.push(countedLine(account.counted));
    lines.push(`  ${account.sessions} ${account.sessions === 1 ? "session" : "sessions"} counted, kept only on this computer.`);
  }
  lines.push("");
  lines.push(REQUIRED_COPY.join(" "));
  return lines.join("\n");
}

// -- Locating a transcript -----------------------------------------------------

/** Expands a leading ~ so a path handed over by a hook always resolves. */
export function expandHome(p) {
  if (typeof p !== "string") return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeSessionId(id) {
  return typeof id === "string" && SESSION_ID.test(id);
}

/**
 * Finds <config dir>/projects/<project>/<session id>.jsonl without ever
 * joining an unvalidated id into a path. Returns undefined if absent.
 */
export function findTranscript(sessionId, env = process.env) {
  if (!isSafeSessionId(sessionId)) return undefined;
  const configDir =
    env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.length > 0
      ? env.CLAUDE_CONFIG_DIR
      : join(homedir(), ".claude");
  const projects = join(expandHome(configDir), "projects");
  let names;
  try {
    names = readdirSync(projects);
  } catch {
    return undefined;
  }
  let best;
  let bestMtime = -1;
  for (const name of names) {
    const candidate = join(projects, name, `${sessionId}.jsonl`);
    try {
      if (!existsSync(candidate)) continue;
      const m = statSync(candidate).mtimeMs;
      if (m > bestMtime) {
        best = candidate;
        bestMtime = m;
      }
    } catch {
      // ignore unreadable candidates
    }
  }
  return best;
}

export function readTranscript(path) {
  return parseSession(readFileSync(expandHome(path), "utf8"));
}

// -- Opt-in environment --------------------------------------------------------

export function receiptsEnabled(env = process.env) {
  const v = String(env.AIEDS_RECEIPTS ?? "").trim().toLowerCase();
  return !["off", "0", "false", "no", "disabled"].includes(v);
}

/** One JSON line of numbers only, for the optional local log. */
export function logLine(sessionId, receipt, now = new Date()) {
  const s = receipt.session;
  return JSON.stringify({
    ts: now.toISOString(),
    session: isSafeSessionId(sessionId) ? sessionId : "",
    aiedsVersion: s.aiedsVersion,
    methodologyVersion: s.methodologyVersion,
    models: [...new Set(s.models)],
    modelCalls: s.calls,
    inputTokens: s.tokens.input,
    outputTokens: s.tokens.output,
    energyWh: s.energyWh,
    gCO2e: s.carbonGrams,
    treeTimeMinutes: s.treeTimeMinutes,
    provenance: s.provenance,
    confidence: s.confidence,
  });
}

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
  EDUCATIONAL_COMPARISON_COPY,
  FACTORS,
  MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR,
  METHODOLOGY_VERSION,
  MINUTES_PER_YEAR,
  MODEL_ENERGY_PROFILES,
  MODELED_ESTIMATE_COPY,
  MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
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
  const provenances = [];
  const models = [];
  let allInTable = true;

  for (const g of groups.values()) {
    const u = sumUsage(g.calls);
    const d = disclosureFromResponse({
      provider: g.provider,
      model: g.model || undefined,
      inputTokenBreakdown: {
        plain: u.plain,
        cacheCreation: u.cacheCreation,
        cacheRead: u.cacheRead,
      },
      outputTokens: u.output,
    });
    energyWh += d.energyWh;
    carbonGrams += d.carbonGrams;
    treeTimeMinutes += d.treeTimeMinutes;
    provenances.push(d.provenance);
    models.push(g.model || "unknown");
    if (energyProfileForModel(g.model || undefined).matchPrefixes.length === 0) {
      allInTable = false;
    }
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
    confidence: "low",
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
// Rules (owner-approved format, 2026-10-23):
//   - Units auto-scale so the number reads 1 to 999 where possible: Wh below
//     1000 else kWh; g CO2e below 1000 else kg; minutes below 120 else hours;
//     mL below 1000 else L.
//   - Significant figures: two when confidence is low or the basis is a class
//     estimate, three otherwise. A value of 1 or more never shows more than one
//     decimal place. Below 1 the significant figures govern, so a small figure
//     is not rounded away to 0.
//   - Water carries a tilde and no range. The range is in `aieds explain`.
//   - Two scopes, two lines. The tokens line appears only when cache reads are
//     20 percent or more of the input.

/** Rounds to `sf` significant figures; a value of 1 or more keeps at most one decimal. */
function roundFigure(x, sf) {
  if (!Number.isFinite(x) || x <= 0) return { value: 0, decimals: 0 };
  const placesFor = (v) => {
    const places = sf - 1 - Math.floor(Math.log10(v));
    return v >= 1 ? Math.min(places, 1) : places;
  };
  const round = (v, p) => {
    const f = 10 ** Math.abs(p);
    return p >= 0 ? Math.round(v * f) / f : Math.round(v / f) * f;
  };
  let places = placesFor(x);
  let value = round(x, places);
  // 9.96 rounds up to 10: derive the places again from the rounded value.
  places = placesFor(value);
  value = round(x, places);
  return { value, decimals: Math.max(0, places) };
}

function figureText(x, sf) {
  const r = roundFigure(x, sf);
  return r.value.toFixed(r.decimals);
}

/**
 * Formats a value in the right unit. `steps` is ascending
 * [{ unit, perBase, limit }]; the value moves up a step once it reaches the
 * limit of the step below. The check is repeated on the rounded figure, so
 * 999.6 Wh at two figures reads as 1.0 kWh and never as 1000 Wh.
 */
function scaled(base, steps, sf) {
  let i = 0;
  while (i < steps.length - 1 && base >= steps[i].limit) i += 1;
  let text = figureText(base / steps[i].perBase, sf);
  if (i < steps.length - 1 && Number(text) * steps[i].perBase >= steps[i].limit) {
    i += 1;
    text = figureText(base / steps[i].perBase, sf);
  }
  return `${text} ${steps[i].unit}`;
}

const ENERGY_STEPS = [
  { unit: "Wh", perBase: 1, limit: 1000 },
  { unit: "kWh", perBase: 1000, limit: Infinity },
];
const CARBON_STEPS = [
  { unit: "g CO2e", perBase: 1, limit: 1000 },
  { unit: "kg CO2e", perBase: 1000, limit: Infinity },
];
const TREE_STEPS = [
  { unit: "min", perBase: 1, limit: 120 },
  { unit: "h", perBase: 60, limit: Infinity },
];
const WATER_STEPS = [
  { unit: "mL", perBase: 1, limit: 1000 },
  { unit: "L", perBase: 1000, limit: Infinity },
];

const DEFAULT_SF = 2;

export function formatEnergy(wh, sf = DEFAULT_SF) {
  return scaled(wh, ENERGY_STEPS, sf);
}

export function formatCarbon(grams, sf = DEFAULT_SF) {
  return scaled(grams, CARBON_STEPS, sf);
}

export function formatTreeTime(minutes, sf = DEFAULT_SF) {
  return scaled(minutes, TREE_STEPS, sf);
}

/** Two figures when confidence is low or the basis is a class estimate, else three. */
export function sigFigsFor(d) {
  const classEstimate = d.provenance === "class-estimated" || d.provenance === "unknown";
  return d.confidence === "low" || classEstimate ? 2 : 3;
}

/** "~1.8 L", or "" when there is no usable water estimate (methodology 2.6.12). */
export function formatWater(d, sf = DEFAULT_SF) {
  return d.water ? `~${scaled(d.water.waterMl.default, WATER_STEPS, sf)}` : "";
}

/** Compact token count: 7.3k, 540k, 2.08M. */
export function formatTokens(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) {
    const k = n / 1000;
    const text = k < 100 ? k.toFixed(1) : String(Math.round(k));
    // 999.6k rounds up to 1000k, which is 1.00M.
    return Number(text) >= 1000 ? "1.00M" : `${text}k`;
  }
  const m = n / 1e6;
  return `${m >= 100 ? Math.round(m) : m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
}

function formatCount(n) {
  return n.toLocaleString("en-US");
}

/** The share of input that was a cache read, 0 to 1. */
function cacheShare(tokens) {
  return tokens.input > 0 ? tokens.cacheRead / tokens.input : 0;
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

const SEP = " - ";
const LABEL_WIDTH = 16;
const label = (text) => text.padEnd(LABEL_WIDTH);

function scopeLine(name, d) {
  const sf = sigFigsFor(d);
  const parts = [
    formatEnergy(d.energyWh, sf),
    formatCarbon(d.carbonGrams, sf),
    `${formatTreeTime(d.treeTimeMinutes, sf)} tree-time`,
  ];
  const water = formatWater(d, sf);
  if (water.length > 0) parts.push(`${water} water`);
  return label(name) + parts.join(SEP);
}

function tokensLine(t) {
  if (cacheShare(t) < 0.2) return "";
  const pct = Math.round(cacheShare(t) * 100);
  return (
    label("tokens") +
    `${formatTokens(t.input)} in (${pct}% cache read)${SEP}${formatTokens(t.output)} out`
  );
}

function footerLine(d) {
  const models = [...new Set(d.models)];
  // A model with no published figure says so on the receipt itself, because a
  // wrapper receipt has no session to `explain`.
  const note = !d.modelsInTable ? " (not in table)" : d.provenance === "unknown" ? " (no published figure)" : "";
  const names = models.length === 0 ? "unknown model" : models.join(", ") + note;
  return `estimate, ${d.confidence} confidence${SEP}${names}${SEP}${d.aiedsVersion}`;
}

/**
 * The one printer. `scopes` is an ordered list of { name, d } (one disclosure
 * each); `tokenScope` is the disclosure whose tokens line may appear; `footer`
 * is the disclosure the last line describes. Returns four lines at most.
 */
function receiptLines(scopes, tokenScope, footer) {
  return [
    ...scopes.map((s) => scopeLine(s.name, s.d)),
    tokensLine(tokenScope.tokens),
    footerLine(footer),
  ].filter((x) => x.length > 0);
}

const sessionName = (s) => `session (${s.calls})`;

/**
 * The receipt text a user sees after each response: this response and the
 * session on two lines (never one number), the tokens line when the cache
 * explains the size, and one line of basis. Cached tokens are counted as input
 * (methodology 2.4.1); the breakdown is in `aieds explain`. Plain ASCII.
 */
export function formatReceipt(receipt) {
  const { response: r, session: s } = receipt;
  return receiptLines(
    [
      { name: "this response", d: r },
      { name: sessionName(s), d: s },
    ],
    r,
    s,
  ).join("\n");
}

/**
 * One-response receipt for the wrappers (Ollama, any OpenAI-compatible chat
 * completion) and the Copilot hook. There is no session to total.
 */
export function formatResponseReceipt(d) {
  return receiptLines([{ name: "this response", d }], d, d).join("\n");
}

/** `aieds receipt`: the session so far, one scope. */
export function formatSessionReceipt(session) {
  return receiptLines([{ name: sessionName(session), d: session }], session, session).join("\n");
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
  return lines;
}

/**
 * Formulas, constants and coefficient sources, all read from the library.
 * Given a receipt ({ response, session }), also prints what the compact
 * receipt rounds away: the unrounded figures, the water range and the full
 * token counts.
 */
export function formatExplanation(receipt) {
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
    lines.push("This receipt, unrounded (the receipt shows two figures while confidence is low):");
    lines.push(...unroundedBlock("this response", receipt.response));
    lines.push(...unroundedBlock(`session (${receipt.session.calls})`, receipt.session));
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

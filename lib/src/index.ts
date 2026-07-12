// AIEDS reference library - the ENERGY-FIRST response-surface path (methodology
// 2.0.0, impact model v2).
//
// Given what an AI response carries (tokens + model), returns the full AIEDS
// disclosure: modeled ENERGY first, carbon DERIVED from energy, and the Level-3
// human equivalencies (Tree-Time, phone charges, LED-bulb hours, laptop
// minutes, driving meters).
//
//   energyWh = inTok/1000 * whPer1kIn[model] + outTok/1000 * whPer1kOut[model]
//   energyWh *= pue[model]                      (1.0 when the basis is all-in)
//   carbonG  = energyWh/1000 * MODELED_GRID_INTENSITY_GRAMS_PER_KWH
//   treeMin  = carbonG / MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR * MINUTES_PER_YEAR
//
// This is a byte-for-byte port of the shipped model in
// `rk_ai/lib/src/impact/ai_impact.dart` (the app's source of truth); same
// coefficients, same formula, so the app and the standard agree to the number.
// Changing any coefficient here is a methodology change (owner-ratified; bump
// METHODOLOGY_VERSION and methodology.md atomically - see CONTRIBUTING).
//
// v1 (1.x) was a single flat constant (0.30 gCO2e per 1k tokens for every
// model) and derived ENERGY BACKWARD from carbon. Both were wrong; v2 replaces
// them. The v1 carbon-first reader is retained ONLY to read pre-v2 rows.

export const AIEDS_VERSION = "AIEDS v2";

/** Methodology snapshot these constants belong to (methodology.md 2.0.0). */
export const METHODOLOGY_VERSION = "2.0.0";

/**
 * Impact-model version stamped on every disclosure and usage row so mixed-model
 * aggregates can refuse to blend incomparable numbers (methodology.md 2.4).
 */
export const AIEDS_IMPACT_MODEL_VERSION = "v2";

// -- Level-1 modeling constants (mirror ai_impact.dart) ----------------------

/**
 * Modeled global-average grid carbon intensity (gCO2e/kWh). Pinned app-surface
 * constant: the shipped rand0m.ai app has disclosed with 429 since AIEDS v1, so
 * the standard follows the shipped number. Distinct from the estimation table's
 * `global_average` (436) by design (methodology.md 2.4).
 */
export const MODELED_GRID_INTENSITY_GRAMS_PER_KWH = 429.0;

/**
 * One Mature Reference Tree (MRT) sequesters ~21 kg CO2e/year (common forestry
 * heuristic; the AIEDS 2.0.0 tree-time basis). v1 used 22 kg; v2 unified to 21.
 */
export const MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR = 21000.0;
export const MINUTES_PER_YEAR = 525600.0;
export const PHONE_CHARGE_WH = 12.0;
export const LED_BULB_WATTS = 10.0;
export const LAPTOP_WATTS = 50.0;
export const CAR_DRIVING_GRAMS_CO2E_PER_KM = 170.0;

// -- Confidence tiers (methodology.md 2.4 honesty contract) ------------------

/**
 * How much trust a coefficient deserves. Shipped to the UI, never hidden.
 * - `measured`         we benchmarked it ourselves.
 * - `vendor-published` the provider published a figure (cited; split noted).
 * - `class-estimated`  inferred from model class; no provider figure exists.
 * - `unknown`          nothing sourceable; class fallback, labeled unknown.
 */
export type AiedsConfidenceTier =
  | "measured"
  | "vendor-published"
  | "class-estimated"
  | "unknown";

/**
 * Per-model-class energy profile. Every entry carries a confidence tier and a
 * REQUIRED citation - a number without provenance does not belong in the table.
 */
export interface ModelEnergyProfile {
  /** Lowercased model-id prefixes this profile covers. */
  readonly matchPrefixes: readonly string[];
  /** Modeled energy per 1000 INPUT tokens (prefill), Wh. */
  readonly whPer1kIn: number;
  /** Modeled energy per 1000 OUTPUT tokens (decode), Wh. Always > input. */
  readonly whPer1kOut: number;
  /** Datacenter overhead multiplier; 1.0 when the basis figure is all-in. */
  readonly pue: number;
  readonly confidence: AiedsConfidenceTier;
  readonly citation: string;
}

// Shared split assumption for turning per-PROMPT vendor figures into per-token
// coefficients: a median exchange ~1000 input + 250 output tokens, output
// costing 4x input per token (sequential decode vs parallel prefill; provider
// pricing ratios run 3-5x). Under that split a per-prompt figure E gives
// whPer1kIn = E/2, whPer1kOut = 2E.
const SPLIT_ASSUMPTION =
  "split assumption: median exchange ~1000 in + 250 out tokens, output 4x " +
  "input per token";

/**
 * The coefficient table. Four entries, none invented: two derive from published
 * vendor figures, two say plainly that they are class estimates. Ported verbatim
 * from `rk_ai/lib/src/impact/ai_impact.dart`.
 */
export const MODEL_ENERGY_PROFILES: readonly ModelEnergyProfile[] = [
  {
    matchPrefixes: ["gemini"],
    whPer1kIn: 0.12,
    whPer1kOut: 0.48,
    // Google's figure is comprehensive (active + idle + datacenter overhead per
    // their methodology) - applying PUE again would double count.
    pue: 1.0,
    confidence: "vendor-published",
    citation:
      "Google (Aug 2025): median Gemini Apps text prompt = 0.24 Wh, 0.03 " +
      "gCO2e (arxiv.org/abs/2508.15734, 'Measuring the environmental impact " +
      "of delivering AI'); " + SPLIT_ASSUMPTION + ".",
  },
  {
    matchPrefixes: ["gpt", "o1", "o3", "o4", "chatgpt"],
    whPer1kIn: 0.17,
    whPer1kOut: 0.68,
    // Presented as the average per-query total; treated all-in.
    pue: 1.0,
    confidence: "vendor-published",
    citation:
      "OpenAI / S. Altman blog 'The Gentle Singularity' (Jun 2025): average " +
      "ChatGPT query ~0.34 Wh (blog-grade figure, no methodology published); " +
      SPLIT_ASSUMPTION + ".",
  },
  {
    matchPrefixes: ["claude"],
    whPer1kIn: 0.145,
    whPer1kOut: 0.58,
    // Bare-compute-shaped class estimate, so hyperscaler overhead applies:
    // fleet PUEs run ~1.09 (Google 2024) to ~1.56 (Uptime 2024); 1.2 = class.
    pue: 1.2,
    confidence: "class-estimated",
    citation:
      "No Anthropic-published per-query figure as of 2026-01. Class estimate: " +
      "midpoint of the two published frontier figures (0.24 Wh Google, 0.34 " +
      "Wh OpenAI) = 0.29 Wh/prompt; " + SPLIT_ASSUMPTION + "; PUE 1.2 " +
      "(hyperscaler class).",
  },
  {
    matchPrefixes: ["grok"],
    whPer1kIn: 0.145,
    whPer1kOut: 0.58,
    pue: 1.2,
    confidence: "unknown",
    citation:
      "No xAI-published figure found. UNKNOWN: falls back to the frontier-" +
      "class estimate (see claude entry); treat as order-of-magnitude only.",
  },
];

/**
 * Fallback for models matching no prefix: the frontier-class estimate, labeled
 * unknown (never silently confident).
 */
export const UNKNOWN_MODEL_PROFILE: ModelEnergyProfile = {
  matchPrefixes: [],
  whPer1kIn: 0.145,
  whPer1kOut: 0.58,
  pue: 1.2,
  confidence: "unknown",
  citation:
    "Model not in the coefficient table. UNKNOWN: frontier-class estimate " +
    "(midpoint of published 0.24-0.34 Wh/prompt figures, output 4x input, " +
    "PUE 1.2); order-of-magnitude only.",
};

/** Profile lookup by model id (case-insensitive prefix match). */
export function energyProfileForModel(
  modelId: string | undefined,
): ModelEnergyProfile {
  const id = (modelId ?? "").trim().toLowerCase();
  if (id.length > 0) {
    for (const profile of MODEL_ENERGY_PROFILES) {
      for (const prefix of profile.matchPrefixes) {
        if (id.startsWith(prefix)) return profile;
      }
    }
  }
  return UNKNOWN_MODEL_PROFILE;
}

// -- Tree-Time (Level 3) -----------------------------------------------------

/**
 * AIEDS 2.0.0 Tree-Time:
 * `tree_time_minutes = carbon_g / MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR * MINUTES_PER_YEAR`.
 */
export function treeTimeMinutesFor(carbonGrams: number): number {
  if (carbonGrams <= 0) return 0;
  return (
    (carbonGrams / MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR) * MINUTES_PER_YEAR
  );
}

/** Compact, human-friendly Tree-Time label (mirrors the app rendering). */
export function treeTimeLabel(treeTimeMinutes: number): string {
  if (treeTimeMinutes <= 0) return "0 min";
  if (treeTimeMinutes < 1) return "<1 min";
  if (treeTimeMinutes < 60) return `${treeTimeMinutes.toFixed(1)} min`;
  return `${(treeTimeMinutes / 60).toFixed(1)} hrs`;
}

// -- Response disclosure -----------------------------------------------------

export interface ResponseInput {
  provider: string;
  /** Model id; selects the per-model coefficient (prefix match). */
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface AiedsResponseDisclosure {
  aiedsVersion: string;
  methodologyVersion: string;
  /** Impact-model version; aggregates MUST NOT blend across versions. */
  aiedsImpactModelVersion: string;
  provider: string;
  model?: string;
  latencyMs?: number;
  /** Level 2 - operational metrics, passed through. */
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Level 1 - modeled scientific metrics (energy is primary). */
  energyWh: number;
  carbonGrams: number;
  /** Level 3 - human equivalencies (educational comparisons only). */
  treeTimeMinutes: number;
  treeTimeLabel: string;
  phoneCharges: number;
  ledBulbHours: number;
  laptopMinutes: number;
  drivingMeters: number;
  /** Provenance the UI must not hide. */
  confidence: AiedsConfidenceTier;
  citation: string;
  /** Required AIEDS disclosure copy. */
  notes: readonly string[];
}

export const MODELED_ESTIMATE_COPY = "Energy and carbon are modeled estimates.";
export const EDUCATIONAL_COMPARISON_COPY =
  "Tree-Time and equivalents are educational comparisons.";
export const ENERGY_FIRST_COPY =
  "Energy is modeled first from per-model coefficients; carbon is derived from energy.";

/**
 * Builds an AIEDS 2.0.0 disclosure ENERGY-FIRST from what a response carries
 * (tokens + model). Energy is modeled from the per-model coefficient table;
 * carbon is derived from energy. The disclosure carries the coefficient's
 * confidence tier and citation.
 */
export function disclosureFromResponse(
  input: ResponseInput,
): AiedsResponseDisclosure {
  const profile = energyProfileForModel(input.model);
  const inputTokens = Math.max(0, input.inputTokens ?? 0);
  const outputTokens = Math.max(0, input.outputTokens ?? 0);

  let energyWh =
    (inputTokens / 1000) * profile.whPer1kIn +
    (outputTokens / 1000) * profile.whPer1kOut;
  energyWh *= profile.pue;

  const carbon = (energyWh / 1000) * MODELED_GRID_INTENSITY_GRAMS_PER_KWH;
  const treeMinutes = treeTimeMinutesFor(carbon);

  return {
    aiedsVersion: AIEDS_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
    aiedsImpactModelVersion: AIEDS_IMPACT_MODEL_VERSION,
    provider: input.provider,
    model: input.model,
    latencyMs: input.latencyMs,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: input.costUsd ?? 0,
    energyWh,
    carbonGrams: carbon,
    treeTimeMinutes: treeMinutes,
    treeTimeLabel: treeTimeLabel(treeMinutes),
    phoneCharges: energyWh / PHONE_CHARGE_WH,
    ledBulbHours: energyWh / LED_BULB_WATTS,
    laptopMinutes: (energyWh / LAPTOP_WATTS) * 60,
    drivingMeters: (carbon / CAR_DRIVING_GRAMS_CO2E_PER_KM) * 1000,
    confidence: profile.confidence,
    citation: profile.citation,
    notes: [
      `${AIEDS_VERSION} disclosure (impact model ${AIEDS_IMPACT_MODEL_VERSION})`,
      ENERGY_FIRST_COPY,
      MODELED_ESTIMATE_COPY,
      EDUCATIONAL_COMPARISON_COPY,
    ],
  };
}

// -- Legacy v1 reader (deprecated; read-only) --------------------------------

export interface V1CarbonRowInput {
  provider: string;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  /** Pre-v2 rows stored a carbon estimate; energy was inverted from it. */
  carbonGrams?: number;
}

/**
 * @deprecated 1.x carbon-first inversion, retained ONLY to read pre-v2 rows
 * (methodology.md 2.4). Do NOT use for new disclosures - use
 * {@link disclosureFromResponse} (energy-first). Energy is inverted from the
 * stored carbon through the pinned 429 gCO2e/kWh; the MRT basis is the 1.x
 * 22 kg value so old rows re-read identically.
 */
export function disclosureFromV1CarbonRow(
  input: V1CarbonRowInput,
): AiedsResponseDisclosure {
  const V1_MRT_GRAMS_PER_YEAR = 22000.0;
  const carbon = Math.max(0, input.carbonGrams ?? 0);
  const energyWh = (carbon / MODELED_GRID_INTENSITY_GRAMS_PER_KWH) * 1000;
  const treeMinutes =
    carbon <= 0 ? 0 : (carbon / V1_MRT_GRAMS_PER_YEAR) * MINUTES_PER_YEAR;
  const inputTokens = Math.max(0, input.inputTokens ?? 0);
  const outputTokens = Math.max(0, input.outputTokens ?? 0);

  return {
    aiedsVersion: "AIEDS v1",
    methodologyVersion: "1.1.0",
    aiedsImpactModelVersion: "v1",
    provider: input.provider,
    model: input.model,
    latencyMs: input.latencyMs,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: input.costUsd ?? 0,
    energyWh,
    carbonGrams: carbon,
    treeTimeMinutes: treeMinutes,
    treeTimeLabel: treeTimeLabel(treeMinutes),
    phoneCharges: energyWh / PHONE_CHARGE_WH,
    ledBulbHours: energyWh / LED_BULB_WATTS,
    laptopMinutes: (energyWh / LAPTOP_WATTS) * 60,
    drivingMeters: (carbon / CAR_DRIVING_GRAMS_CO2E_PER_KM) * 1000,
    confidence: "unknown",
    citation:
      "v1 row: flat 0.30 gCO2e/1k-token model, energy inverted from carbon. " +
      "SUPERSEDED by 2.0.0; read-only.",
    notes: [
      "AIEDS v1 row (SUPERSEDED - read-only)",
      "v1 derived energy backward from carbon; do not use for new disclosures.",
      EDUCATIONAL_COMPARISON_COPY,
    ],
  };
}

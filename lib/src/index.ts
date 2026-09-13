// AiEDs reference library - the ENERGY-FIRST response-surface path (methodology
// 2.1.0, impact model v2).
//
// Given what an AI response carries (tokens + model), returns the full AiEDs
// disclosure: modeled ENERGY first, carbon DERIVED from energy, and the Level-3
// human equivalencies (Tree-Time, phone charges, LED-bulb hours, laptop
// minutes, driving meters).
//
//   energyWh = inTok/1000 * whPer1kIn[model] + outTok/1000 * whPer1kOut[model]
//   energyWh *= pue[model]                      (1.0 when the basis is all-in)
//   carbonG  = energyWh/1000 * MODELED_GRID_INTENSITY_GRAMS_PER_KWH
//   treeMin  = carbonG / MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR * MINUTES_PER_YEAR
//
// This is a byte-for-byte port of the shipped rand0m.ai app's energy model
// (its source of truth); same coefficients, same formula, so the app and the
// standard agree to the number.
// Changing any coefficient here is a methodology change (owner-ratified; bump
// METHODOLOGY_VERSION and methodology.md atomically - see CONTRIBUTING).
//
// v1 (1.x) was a single flat constant (0.30 gCO2e per 1k tokens for every
// model) and derived ENERGY BACKWARD from carbon. Both were wrong; v2 replaces
// them. The v1 carbon-first reader is retained ONLY to read pre-v2 rows.

import {
  AIEDS_IMPACT_MODEL_VERSION,
  CAR_DRIVING_GRAMS_CO2E_PER_KM,
  LAPTOP_WATTS,
  LED_BULB_WATTS,
  MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR,
  METHODOLOGY_VERSION,
  MINUTES_PER_YEAR,
  MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
  PHONE_CHARGE_WH,
  energyProfileForModel,
} from "./factors.js";
import { provenanceForSchema } from "./factors.js";
import type {
  AiedsConfidence,
  AiedsProvenance,
  AiedsSchemaProvenance,
} from "./factors.js";

// The coefficient table, the confidence tiers, the grid intensities and the
// Level-3 constants all come from spec/v2/aieds-factors.json through
// ./factors.js. Nothing is restated here. Re-exported so the package's public
// surface is unchanged for callers.
export {
  AIEDS_IMPACT_MODEL_VERSION,
  CAR_DRIVING_GRAMS_CO2E_PER_KM,
  FACTORS,
  LAPTOP_WATTS,
  LED_BULB_WATTS,
  MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR,
  METHODOLOGY_VERSION,
  MINUTES_PER_YEAR,
  MODEL_ENERGY_PROFILES,
  MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
  PHONE_CHARGE_WH,
  SCHEMA_PROVENANCE_VALUES,
  TABLE_GLOBAL_AVERAGE_GRAMS_PER_KWH,
  UNKNOWN_MODEL_PROFILE,
  energyProfileForModel,
  provenanceForSchema,
} from "./factors.js";
export type {
  AiedsConfidence,
  AiedsConfidenceTier,
  AiedsProvenance,
  AiedsSchemaProvenance,
  ModelEnergyProfile,
} from "./factors.js";

/** Human-facing version label. Tracks the impact-model version in the table. */
export const AIEDS_VERSION = `AiEDs ${AIEDS_IMPACT_MODEL_VERSION}`;

// -- Tree-Time (Level 3) -----------------------------------------------------

/**
 * AiEDs 2.0.0 Tree-Time:
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

/**
 * How the input tokens split when the provider reports a cached prefill
 * (methodology 2.1.0 section 2.4.1). All three parts are INPUT and all three
 * are charged at `whPer1kIn`.
 */
export interface InputTokenBreakdown {
  /** Input tokens that were neither written to nor read from a cache. */
  plain?: number;
  /** Tokens the provider charged for writing into the prompt cache. */
  cacheCreation?: number;
  /** Tokens served from the prompt cache. */
  cacheRead?: number;
}

export interface ResponseInput {
  provider: string;
  /** Model id; selects the per-model coefficient (prefix match). */
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  /**
   * Optional cached-prefill breakdown. Passed through to the disclosure; it
   * does NOT change the total. If `inputTokens` is omitted the parts are summed
   * to give it; if both are given and they disagree, the call throws rather
   * than silently preferring one.
   */
  inputTokenBreakdown?: InputTokenBreakdown;
  /**
   * The producer's confidence in the ENERGY figure. Omit and it is `low`, which
   * is what methodology 2.1.0 section 5.1 requires of any token proxy, and this
   * path is one. Set it only with a measurement you can point at.
   */
  confidence?: AiedsConfidence;
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
  /**
   * Where the COEFFICIENT came from (methodology 2.1.0 section 5.1). The UI
   * must not hide it. Named `confidence` before lib 2.1.0, which was wrong: it
   * never graded the energy figure.
   */
  provenance: AiedsProvenance;
  /**
   * The producer's confidence in the ENERGY figure (methodology section 5).
   * `low` unless the caller overrode it: this path is a token proxy.
   */
  confidence: AiedsConfidence;
  /** Present only when the caller supplied one. The total is unaffected. */
  inputTokenBreakdown?: InputTokenBreakdown;
  citation: string;
  /** Required AiEDs disclosure copy. */
  notes: readonly string[];
}

export const MODELED_ESTIMATE_COPY = "Energy and carbon are modeled estimates.";
export const EDUCATIONAL_COMPARISON_COPY =
  "Tree-Time and equivalents are educational comparisons.";
export const ENERGY_FIRST_COPY =
  "Energy is modeled first from per-model coefficients; carbon is derived from energy.";

/**
 * Builds an AiEDs disclosure ENERGY-FIRST from what a response carries (tokens
 * + model). Energy is modeled from the per-model coefficient table; carbon is
 * derived from energy. The disclosure carries the coefficient's PROVENANCE and
 * citation, and the producer's CONFIDENCE in the energy figure, which defaults
 * to `low` because this path is a token proxy (methodology 2.1.0 section 5.1).
 */
export function disclosureFromResponse(
  input: ResponseInput,
): AiedsResponseDisclosure {
  const profile = energyProfileForModel(input.model);
  const breakdown = input.inputTokenBreakdown;
  const breakdownTotal =
    breakdown === undefined
      ? undefined
      : Math.max(0, breakdown.plain ?? 0) +
        Math.max(0, breakdown.cacheCreation ?? 0) +
        Math.max(0, breakdown.cacheRead ?? 0);

  // Cached prefill, methodology 2.1.0 section 2.4.1: cache-creation and
  // cache-read tokens are input, counted at the full input coefficient. That
  // is a conservative bias and the methodology says so; it is not a measured
  // discount, so nothing here discounts them.
  //
  // The breakdown never moves the total. If the caller gives both and they
  // disagree, one of the two is wrong and a disclosure built from either would
  // be a number nobody can reproduce, so this throws instead of picking.
  if (
    breakdownTotal !== undefined &&
    input.inputTokens !== undefined &&
    Math.max(0, input.inputTokens) !== breakdownTotal
  ) {
    throw new Error(
      `inputTokenBreakdown sums to ${breakdownTotal} but inputTokens is ` +
        `${input.inputTokens}. The breakdown must account for exactly the ` +
        `input total (methodology 2.4.1); it never changes it.`,
    );
  }

  const inputTokens = Math.max(0, input.inputTokens ?? breakdownTotal ?? 0);
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
    provenance: profile.confidence,
    confidence: input.confidence ?? "low",
    ...(breakdown === undefined ? {} : { inputTokenBreakdown: breakdown }),
    citation: profile.citation,
    notes: [
      `${AIEDS_VERSION} disclosure (impact model ${AIEDS_IMPACT_MODEL_VERSION})`,
      ENERGY_FIRST_COPY,
      MODELED_ESTIMATE_COPY,
      EDUCATIONAL_COMPARISON_COPY,
    ],
  };
}

// -- Schema record -----------------------------------------------------------

/**
 * A disclosure record in the shape `spec/aieds.schema.json` validates.
 *
 * The rich object {@link disclosureFromResponse} returns is for a UI: it
 * carries Level-2 operational metrics and Level-3 equivalencies the schema does
 * not model. This is the subset a consumer validates and archives.
 */
export interface AiedsSchemaRecord {
  id: string;
  subject: { kind: "model" | "agent" | "app"; name: string; version?: string };
  scope: "device" | "usage" | "inference" | "training";
  window: string;
  compute?: { tokens?: number };
  energyKWh: number;
  gCO2e: number;
  gridIntensity: { gCO2ePerKWh: number; region?: string };
  confidence: AiedsConfidence;
  provenance?: AiedsSchemaProvenance;
  methodologyVersion: string;
  source: string;
  generatedAt: string;
}

/** The record fields the caller must supply; the rest come from the disclosure. */
export interface SchemaRecordOptions {
  id: string;
  subject: { kind: "model" | "agent" | "app"; name: string; version?: string };
  scope: "device" | "usage" | "inference" | "training";
  /** ISO 8601 duration, e.g. "PT1S" for one response. */
  window: string;
  source: string;
  /** ISO 8601 date-time. Defaults to now. */
  generatedAt?: string;
  /** Grid region label for the pinned response-surface intensity. */
  gridRegion?: string;
}

/**
 * Maps a disclosure onto the published schema.
 *
 * Two conversions matter and both are lossy in a stated direction:
 *
 * - Energy is Wh here and kWh in the schema, so it is divided by 1000. Carbon
 *   is carried as-is, and `gCO2e = energyKWh x gridIntensity.gCO2ePerKWh`
 *   holds by construction because that is how the disclosure derived it.
 * - `provenance` is narrowed through {@link provenanceForSchema}, because the
 *   published enum is closed and does not carry `synthetic` yet. See the 2.2.0
 *   schema proposal in PR 37.
 *
 * The cached-prefill breakdown is NOT carried: `compute` in the published
 * schema has `additionalProperties: false` and no field for it, so a record
 * with it attached fails validation. The total in `compute.tokens` is
 * unchanged, which is exactly what methodology 2.4.1 says to do until the
 * schema has somewhere to put the parts.
 */
export function schemaRecordFromDisclosure(
  disclosure: AiedsResponseDisclosure,
  options: SchemaRecordOptions,
): AiedsSchemaRecord {
  return {
    id: options.id,
    subject: options.subject,
    scope: options.scope,
    window: options.window,
    compute: { tokens: disclosure.totalTokens },
    energyKWh: disclosure.energyWh / 1000,
    gCO2e: disclosure.carbonGrams,
    gridIntensity: {
      gCO2ePerKWh: MODELED_GRID_INTENSITY_GRAMS_PER_KWH,
      region: options.gridRegion ?? "global_average",
    },
    confidence: disclosure.confidence,
    provenance: provenanceForSchema(disclosure.provenance),
    methodologyVersion: disclosure.methodologyVersion,
    source: options.source,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
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
    aiedsVersion: "AiEDs v1",
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
    provenance: "unknown",
    confidence: "low",
    citation:
      "v1 row: flat 0.30 gCO2e/1k-token model, energy inverted from carbon. " +
      "SUPERSEDED by 2.0.0; read-only.",
    notes: [
      "AiEDs v1 row (SUPERSEDED - read-only)",
      "v1 derived energy backward from carbon; do not use for new disclosures.",
      EDUCATIONAL_COMPARISON_COPY,
    ],
  };
}

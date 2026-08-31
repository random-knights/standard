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
import type { AiedsConfidenceTier } from "./factors.js";

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
  TABLE_GLOBAL_AVERAGE_GRAMS_PER_KWH,
  UNKNOWN_MODEL_PROFILE,
  energyProfileForModel,
} from "./factors.js";
export type { AiedsConfidenceTier, ModelEnergyProfile } from "./factors.js";

/** Human-facing version label. Tracks the impact-model version in the table. */
export const AIEDS_VERSION = `AIEDS ${AIEDS_IMPACT_MODEL_VERSION}`;

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

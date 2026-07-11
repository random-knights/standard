// AIEDS v1 reference library — the CARBON-FIRST (response-surface) path.
//
// Given the values an AI response already carries (tokens, model, cost,
// provider-estimated carbon), returns the full AIEDS disclosure: modeled
// energy, carbon, confidence, and the Level-3 human equivalencies (Tree-Time,
// phone charges, LED-bulb hours, laptop minutes, driving meters).
//
// This library BYTE-MIRRORS the rand0m.ai app implementation
// (lib/models/aieds/aieds_disclosure.dart) so the app and the standard agree
// to the number: same constants, same formulas, same clamping and defaults.
// Changing any constant here is a methodology change (owner-ratified; bump
// METHODOLOGY_VERSION and methodology.md atomically — see CONTRIBUTING).
//
// Everything here is a MODELED ESTIMATE. AIEDS v1 adds no provider-derived or
// verified measurement, certification, offset, or restoration claims.

export const AIEDS_VERSION = "AIEDS v1";

/** Methodology snapshot these constants belong to (methodology.md §2.4/§5). */
export const METHODOLOGY_VERSION = "1.1.0";

// ── Level-1 modeling constants (mirror aieds_disclosure.dart) ───────────────

/**
 * Modeled global average grid carbon intensity (gCO2e/kWh) used ONLY to model
 * energy back from reported carbon on the response surface. Pinned to the
 * value the shipped app uses; deliberately distinct from the forward
 * estimation table's `global_average` (methodology.md §2.4 explains why).
 */
export const MODELED_GRID_INTENSITY_GRAMS_PER_KWH = 429.0;

// ── Level-3 equivalency constants (educational only) ────────────────────────

/** AIEDS v1 Mature Reference Tree: 1 MRT sequesters 22 kg CO2e / year. */
export const MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR = 22000.0;
export const MINUTES_PER_YEAR = 525600.0;
export const PHONE_CHARGE_WH = 12.0;
export const LED_BULB_WATTS = 10.0;
export const LAPTOP_WATTS = 50.0;
export const CAR_DRIVING_GRAMS_CO2E_PER_KM = 170.0;

/**
 * AIEDS v1 confidence ladder (response surface). Current disclosures should
 * use "estimated" or "modeled" only; "provider-derived"/"verified" require an
 * approved evidence phase. Maps to the estimation-path enum as
 * estimated/modeled -> low/med, provider-derived -> med/high, verified -> high
 * (methodology.md §5).
 */
export type AiedsConfidence =
  | "estimated"
  | "modeled"
  | "provider-derived"
  | "verified";

export interface ResponseInput {
  provider: string;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  /** Provider- or client-estimated CO2e for this response, in grams. */
  carbonGrams?: number;
  confidence?: AiedsConfidence;
}

export interface AiedsResponseDisclosure {
  aiedsVersion: string;
  methodologyVersion: string;
  provider: string;
  model?: string;
  latencyMs?: number;
  /** Level 2 — operational metrics, passed through. */
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Level 1 — modeled scientific metrics. */
  energyWh: number;
  carbonGrams: number;
  /** Level 3 — human equivalencies (educational comparisons only). */
  treeTimeMinutes: number;
  treeTimeLabel: string;
  phoneCharges: number;
  ledBulbHours: number;
  laptopMinutes: number;
  drivingMeters: number;
  confidence: AiedsConfidence;
  /** Required AIEDS v1 disclosure copy. */
  notes: readonly string[];
}

export const ESTIMATED_DISCLOSURE_LABEL = "AIEDS v1 estimated disclosure";
export const MODELED_ESTIMATE_COPY =
  "Energy and carbon are modeled estimates.";
export const EDUCATIONAL_COMPARISON_COPY =
  "Tree-Time and equivalents are educational comparisons.";

/**
 * AIEDS v1 Tree-Time formula:
 * `tree_time_minutes = (carbon_g_co2e / 22000) * 525600`.
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

/**
 * Builds an AIEDS v1 disclosure from the values an AI response carries.
 * Energy is modeled by inverting the reported carbon estimate through the
 * modeled global grid carbon intensity (provider energy telemetry is not
 * available by default in AIEDS v1).
 */
export function disclosureFromResponse(
  input: ResponseInput,
): AiedsResponseDisclosure {
  const carbon = Math.max(0, input.carbonGrams ?? 0);
  const energyWh = (carbon / MODELED_GRID_INTENSITY_GRAMS_PER_KWH) * 1000;
  const treeMinutes = treeTimeMinutesFor(carbon);
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;

  return {
    aiedsVersion: AIEDS_VERSION,
    methodologyVersion: METHODOLOGY_VERSION,
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
    confidence: input.confidence ?? "estimated",
    notes: [
      ESTIMATED_DISCLOSURE_LABEL,
      MODELED_ESTIMATE_COPY,
      EDUCATIONAL_COMPARISON_COPY,
    ],
  };
}

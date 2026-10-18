// AiEDs modeled water estimate (methodology 2.5.0, section 2.6).
//
//   siteL  = energyKWh x siteWUE
//   gridL  = energyKWh x gridWaterIntensity
//   waterL = siteL + gridL
//   teaspoons = waterL x 1000 / 5
//
// Consumption basis, inference only, location-based, confidence `low` by rule,
// always a low to high range. The coefficients are read from the published
// table (`water` key of spec/v2/aieds-factors.json) through ./factors.js and
// are not restated here. Pure functions: no I/O, no clock.

import {
  FACTORS,
  GRID_BASIS_DEFAULT_LABEL,
  GRID_WATER_L_PER_KWH,
  LITERS_ABOVE_TEASPOONS,
  METHODOLOGY_VERSION,
  SITE_WUE_L_PER_KWH,
  TEASPOON_ML,
  WATER_COPY,
} from "./factors.js";

/** A low / default / high triple. */
export interface WaterRange {
  readonly low: number;
  readonly default: number;
  readonly high: number;
}

export interface WaterEstimate {
  /** Milliliters of water consumed. */
  readonly waterMl: WaterRange;
  /** The same water in teaspoons (5 mL), an educational comparison. */
  readonly teaspoons: WaterRange;
  /**
   * What the grid term rests on. `"US average"` unless Table 5 carries a
   * figure for the requested region (this version carries none), so a region
   * with no figure is never passed off as regional (methodology 2.6.5).
   */
  readonly basis: string;
  /** The region the caller asked for, when it was not served by its own figure. */
  readonly requestedRegion?: string;
  /** Always `low` (methodology 2.6.4). */
  readonly confidence: "low";
}

/** The regions Table 5 has their own grid figure for. None in 2.5.0. */
const REGIONAL_GRID_FIGURES: Readonly<Record<string, number>> = {};

const isUsAverage = (region: string | undefined): boolean => {
  const r = (region ?? "").trim().toLowerCase();
  return r === "" || r === "us average" || r === "us";
};

/**
 * Modeled water for a quantity of energy.
 *
 * `energyWh` is the energy the disclosure already carries (sections 2.1 to
 * 2.4); it is not recomputed or adjusted. Returns `null`, never zero, when the
 * energy is not a finite non-negative number (methodology 2.6.12: no energy,
 * no water claim).
 */
export function waterFromEnergyWh(
  energyWh: number,
  region?: string,
): WaterEstimate | null {
  if (typeof energyWh !== "number" || !Number.isFinite(energyWh) || energyWh < 0) {
    return null;
  }
  const kWh = energyWh / 1000;
  const regional = isUsAverage(region)
    ? undefined
    : REGIONAL_GRID_FIGURES[(region ?? "").trim().toLowerCase()];
  const grid = regional === undefined ? GRID_WATER_L_PER_KWH.value : regional;
  const mlFor = (site: number, gridL: number): number =>
    kWh * (site + gridL) * 1000;
  const waterMl: WaterRange = {
    low: mlFor(SITE_WUE_L_PER_KWH.low, GRID_WATER_L_PER_KWH.low),
    default: mlFor(SITE_WUE_L_PER_KWH.value, grid),
    high: mlFor(SITE_WUE_L_PER_KWH.high, GRID_WATER_L_PER_KWH.high),
  };
  const tsp = (ml: number): number => ml / TEASPOON_ML;
  const basis =
    regional === undefined ? GRID_BASIS_DEFAULT_LABEL : (region ?? "").trim();
  return {
    waterMl,
    teaspoons: {
      low: tsp(waterMl.low),
      default: tsp(waterMl.default),
      high: tsp(waterMl.high),
    },
    basis,
    ...(regional === undefined && !isUsAverage(region)
      ? { requestedRegion: (region ?? "").trim() }
      : {}),
    confidence: "low",
  };
}

/** The optional top-level `water` block of the disclosure schema (2.6.12). */
export interface AiedsWaterBlock {
  waterL: number | null;
  siteL: number | null;
  gridL: number | null;
  rangeL: { low: number; high: number } | null;
  basis: "consumption";
  siteWueLPerKWh: number;
  gridWaterLPerKWh: number;
  gridBasis: "default" | "region";
  gridRegion?: string;
  confidence: "low";
  comparison: { unit: string; value: number } | null;
  factorsVersion: string;
}

/**
 * Builds the schema `water` block from energy in kWh, or `null` (block
 * absent) when there is no usable energy. Site and grid liters stay apart and
 * `waterL` is their sum.
 */
export function waterBlockFromEnergyKWh(
  energyKWh: number | undefined,
): AiedsWaterBlock | null {
  if (
    typeof energyKWh !== "number" ||
    !Number.isFinite(energyKWh) ||
    energyKWh < 0
  ) {
    return null;
  }
  const siteL = energyKWh * SITE_WUE_L_PER_KWH.value;
  const gridL = energyKWh * GRID_WATER_L_PER_KWH.value;
  const waterL = siteL + gridL;
  return {
    waterL,
    siteL,
    gridL,
    rangeL: {
      low: energyKWh * (SITE_WUE_L_PER_KWH.low + GRID_WATER_L_PER_KWH.low),
      high: energyKWh * (SITE_WUE_L_PER_KWH.high + GRID_WATER_L_PER_KWH.high),
    },
    basis: "consumption",
    siteWueLPerKWh: SITE_WUE_L_PER_KWH.value,
    gridWaterLPerKWh: GRID_WATER_L_PER_KWH.value,
    gridBasis: "default",
    confidence: "low",
    comparison: {
      unit: "teaspoon",
      value: (waterL * 1000) / TEASPOON_ML,
    },
    factorsVersion: METHODOLOGY_VERSION,
  };
}

// -- Plain-words line --------------------------------------------------------

/** A milliliter or liter amount with just enough digits to be honest. */
function amount(v: number): string {
  if (v >= 100) return String(Math.round(v));
  if (v >= 0.095) return v.toFixed(1);
  const two = v.toFixed(2);
  return two === "0.00" ? "<0.01" : two;
}

/** The teaspoon comparison in words. Input is teaspoons. */
export function teaspoonPhrase(tsp: number): string {
  if (tsp < 0.0625) return "a small fraction of a teaspoon";
  if (tsp < 0.19) return "about an eighth of a teaspoon";
  if (tsp < 0.29) return "about a quarter of a teaspoon";
  if (tsp < 0.42) return "about a third of a teaspoon";
  if (tsp < 0.62) return "about half a teaspoon";
  if (tsp < 0.88) return "about three quarters of a teaspoon";
  if (tsp < 1.5) return "about a teaspoon";
  if (tsp < 10) return `about ${tsp.toFixed(1)} teaspoons`;
  return `about ${Math.round(tsp)} teaspoons`;
}

/**
 * The receipt line, in plain words. Always carries the range (methodology
 * 2.6.3) and the words "Modeled estimate." Shows liters, with no teaspoon
 * comparison, above 250 teaspoons (2.6.7). Never uses a banned word (2.6.9).
 *
 *   Water: about 1.2 mL (0.4 to 2.7 mL), about a quarter of a teaspoon. Modeled estimate.
 *
 * A grid term that stands in for another region is labeled `US average`.
 */
export function waterLine(estimate: WaterEstimate): string {
  const { waterMl, teaspoons } = estimate;
  const label =
    estimate.requestedRegion === undefined
      ? ""
      : ` Grid water uses a ${GRID_BASIS_DEFAULT_LABEL}.`;
  if (teaspoons.default > LITERS_ABOVE_TEASPOONS) {
    const l = (ml: number): string => amount(ml / 1000);
    return (
      `Water: about ${l(waterMl.default)} L (${l(waterMl.low)} to ${l(waterMl.high)} L). ` +
      `Modeled estimate.${label}`
    );
  }
  return (
    `Water: about ${amount(waterMl.default)} mL ` +
    `(${amount(waterMl.low)} to ${amount(waterMl.high)} mL), ` +
    `${teaspoonPhrase(teaspoons.default)}. Modeled estimate.${label}`
  );
}

/** The third required sentence, "Water is a modeled estimate." */
export const WATER_MODELED_ESTIMATE_COPY: string = WATER_COPY;

/** Words that must not appear in water copy (methodology 2.6.9). */
export const WATER_BANNED_WORDS: readonly string[] = FACTORS.water.bannedWords;

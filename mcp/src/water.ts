// Modeled water for the MCP estimate (methodology 2.5.0, section 2.6).
//
//   waterL = energyKWh x (siteWUE + gridWaterIntensity)
//
// The coefficients are read from the published table through ./factors.js.
// This is the same arithmetic and the same words as lib/src/water.ts (the
// server carries no dependency on the reference library); both are pinned to
// the same test vectors, so they cannot drift without a test failing.
//
// Consumption basis, inference only, always a low to high range, confidence
// `low` by rule, US average for any region without its own figure (none yet).

import { FACTORS } from "./factors.js";

export interface WaterRange {
  low: number;
  default: number;
  high: number;
}

export interface WaterEstimate {
  waterMl: WaterRange;
  teaspoons: WaterRange;
  /** "US average": Table 5 has no regional grid figure in this version. */
  basis: string;
  confidence: "low";
  /** Plain-words receipt line, with the range. */
  line: string;
  /** The third required sentence (methodology 2.6.8). */
  requiredCopy: string;
}

const W = FACTORS.water;

function amount(v: number): string {
  if (v >= 100) return String(Math.round(v));
  if (v >= 0.095) return v.toFixed(1);
  const two = v.toFixed(2);
  return two === "0.00" ? "<0.01" : two;
}

function teaspoonPhrase(tsp: number): string {
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

/** Water for an energy in kWh, or null when there is no usable energy. */
export function waterFromEnergyKWh(energyKWh: number): WaterEstimate | null {
  if (!Number.isFinite(energyKWh) || energyKWh < 0) return null;
  const ml = (site: number, grid: number): number =>
    energyKWh * (site + grid) * 1000;
  const waterMl: WaterRange = {
    low: ml(W.siteWue.low, W.gridWaterIntensity.low),
    default: ml(W.siteWue.value, W.gridWaterIntensity.value),
    high: ml(W.siteWue.high, W.gridWaterIntensity.high),
  };
  const tsp = (v: number): number => v / W.comparison.milliliters;
  const teaspoons: WaterRange = {
    low: tsp(waterMl.low),
    default: tsp(waterMl.default),
    high: tsp(waterMl.high),
  };
  let line: string;
  if (teaspoons.default > W.comparison.showLitersAboveTeaspoons) {
    const l = (v: number): string => amount(v / 1000);
    line =
      `Water: about ${l(waterMl.default)} L (${l(waterMl.low)} to ${l(waterMl.high)} L). ` +
      `Modeled estimate.`;
  } else {
    line =
      `Water: about ${amount(waterMl.default)} mL ` +
      `(${amount(waterMl.low)} to ${amount(waterMl.high)} mL), ` +
      `${teaspoonPhrase(teaspoons.default)}. Modeled estimate.`;
  }
  return {
    waterMl,
    teaspoons,
    basis: W.gridBasisDefaultLabel,
    confidence: "low",
    line,
    requiredCopy: W.requiredCopy,
  };
}

// Loader for the canonical AIEDS factor table.
//
// This file used to carry its own transcription of methodology.md Tables 1 to
// 3. The values were correct, and that was luck rather than design: nothing
// compared the two, so the only reason they agreed is that neither had been
// edited since 2026-06-29. Meanwhile METHODOLOGY_VERSION here was bumped to
// "2.0.0" on 2026-07-12 without the tables moving, so this server has been
// stamping records "2.0.0" while deriving them by the 1.0.0 method.
//
// The version stamp is now read from the table it labels, so the two cannot
// disagree again. The tables themselves come from spec/v2/aieds-factors.json,
// which spec/test/factors.test.mjs gates against the ratified document.
//
// Methodology 2.0.0 did NOT retire the compute paths. Sections 2.1, 2.2 and
// 2.3 and Tables 1 to 3 remain normative; 2.4 was added alongside them. These
// tables are current, not legacy.
import { readFileSync } from "node:fs";

export interface HardwareFactor {
  powerW: number;
  description: string;
  source: string;
}

export interface GridFactor {
  gCO2ePerKWh: number;
  source: string;
}

export type AiedsConfidenceTier =
  | "measured"
  | "vendor-published"
  | "class-estimated"
  | "unknown";

/** A per-model-class energy profile for the section 2.4 response-surface path. */
export interface ModelEnergyProfile {
  readonly matchPrefixes: readonly string[];
  readonly whPer1kIn: number;
  readonly whPer1kOut: number;
  readonly pue: number;
  readonly confidence: AiedsConfidenceTier;
  readonly citation: string;
}

interface ScopedGridValue {
  readonly value: number;
  readonly methodologySection: string;
  readonly appliesTo: string;
  readonly provenance: string;
  readonly citation: string | null;
  readonly note?: string;
}

interface FactorFile {
  readonly methodologyVersion: string;
  readonly impactModelVersion: string;
  readonly constants: {
    readonly matureReferenceTreeCo2eGramsPerYear: {
      readonly value: number;
      readonly note?: string;
    };
    readonly minutesPerYear: { readonly value: number };
  };
  readonly gridIntensity: {
    readonly responseSurfacePinned: ScopedGridValue;
    readonly tableGlobalAverage: ScopedGridValue;
  };
  readonly responseSurface: {
    readonly methodologySection: string;
    readonly formula: readonly string[];
    readonly splitAssumption: string;
    readonly confidenceTiers: readonly AiedsConfidenceTier[];
    readonly profiles: readonly ModelEnergyProfile[];
    readonly unknownProfile: ModelEnergyProfile;
  };
  readonly computePaths: {
    readonly hardwareTdp: {
      readonly methodologySection: string;
      readonly defaultPowerW: number;
      readonly entries: readonly {
        id: string;
        label: string;
        description: string;
        powerW: number;
        source: string;
      }[];
    };
    readonly flop: {
      readonly methodologySection: string;
      readonly joulesPerTflop: number;
      readonly note: string;
    };
    readonly tokenProxy: {
      readonly methodologySection: string;
      readonly defaultScale: string;
      readonly entries: readonly {
        scale: string;
        parameters: string;
        whPerMillionTokens: number;
      }[];
    };
    readonly gridByRegion: {
      readonly methodologySection: string;
      readonly basis: string;
      readonly defaultRegion: string;
      readonly entries: readonly {
        region: string;
        gCO2ePerKWh: number;
        source: string;
      }[];
    };
  };
}

const FACTORS_URL = new URL("../../spec/v2/aieds-factors.json", import.meta.url);

function load(): FactorFile {
  try {
    return JSON.parse(readFileSync(FACTORS_URL, "utf8")) as FactorFile;
  } catch (cause) {
    throw new Error(
      `AIEDS factor table not readable at ${FACTORS_URL.pathname}. This server ` +
        `reads spec/v2/aieds-factors.json; it does not carry its own copy of ` +
        `the coefficients.`,
      { cause },
    );
  }
}

export const FACTORS: FactorFile = load();

/**
 * The methodology version these tables belong to, read from the table itself.
 * Never hardcode it here again: a stamp that can disagree with the numbers it
 * labels is worse than no stamp, because it is a false attestation.
 */
export const METHODOLOGY_VERSION = FACTORS.methodologyVersion;
export const IMPACT_MODEL_VERSION = FACTORS.impactModelVersion;

// Hardware TDP (watts), methodology 2.1 / Table 1. TDP is an upper bound;
// actual draw at sustained inference is typically 60 to 95 percent of TDP.
export const HARDWARE_FACTORS: Record<string, HardwareFactor> =
  Object.fromEntries(
    FACTORS.computePaths.hardwareTdp.entries.map((e) => [
      e.id,
      { powerW: e.powerW, description: e.description, source: e.source },
    ]),
  );

// Grid carbon intensity by region, methodology 3 / Table 3.
export const GRID_FACTORS: Record<string, GridFactor> = Object.fromEntries(
  FACTORS.computePaths.gridByRegion.entries.map((e) => [
    e.region,
    { gCO2ePerKWh: e.gCO2ePerKWh, source: e.source },
  ]),
);

// Token-to-energy proxy (Wh per million tokens), methodology 2.3 / Table 2.
// `default` is an ALIAS for the default scale, not a fourth independent value.
// It used to be a standalone 500 with no counterpart row in Table 2.
export const TOKENS_WH_PER_MILLION: Record<string, number> = (() => {
  const byScale = Object.fromEntries(
    FACTORS.computePaths.tokenProxy.entries.map((e) => [
      e.scale,
      e.whPerMillionTokens,
    ]),
  );
  const fallback = byScale[FACTORS.computePaths.tokenProxy.defaultScale];
  if (fallback === undefined) {
    throw new Error(
      `tokenProxy.defaultScale "${FACTORS.computePaths.tokenProxy.defaultScale}" ` +
        `names no row in Table 2.`,
    );
  }
  return { ...byScale, default: fallback };
})();

export const JOULES_PER_TFLOP = FACTORS.computePaths.flop.joulesPerTflop;
export const DEFAULT_POWER_W = FACTORS.computePaths.hardwareTdp.defaultPowerW;
export const DEFAULT_GRID_REGION = FACTORS.computePaths.gridByRegion.defaultRegion;

/**
 * Grid intensity for the section 2.4 response-surface path. Deliberately
 * distinct from GRID_FACTORS.global_average: the two apply to different
 * derivations and methodology 2.4 documents the split. Do not unify them here.
 */
export const RESPONSE_SURFACE_GRID_GRAMS_PER_KWH =
  FACTORS.gridIntensity.responseSurfacePinned.value;

export const MATURE_REFERENCE_TREE_CO2E_GRAMS_PER_YEAR =
  FACTORS.constants.matureReferenceTreeCo2eGramsPerYear.value;
export const MINUTES_PER_YEAR = FACTORS.constants.minutesPerYear.value;

export const MODEL_ENERGY_PROFILES = FACTORS.responseSurface.profiles;
export const UNKNOWN_MODEL_PROFILE = FACTORS.responseSurface.unknownProfile;

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

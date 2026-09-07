import {
  HARDWARE_FACTORS,
  GRID_FACTORS,
  TOKENS_WH_PER_MILLION,
  JOULES_PER_TFLOP,
  DEFAULT_POWER_W,
  METHODOLOGY_VERSION,
} from "./factors.js";

export interface SubjectInput {
  kind: "model" | "agent" | "app";
  name: string;
  version?: string;
}

export interface ComputeInput {
  tokens?: number;
  gpuSeconds?: number;
  flops?: number;
  hardware?: string;
  // Tool-only hint (not a disclosure field): guides token proxy when gpuSeconds unavailable.
  modelScale?: "small" | "medium" | "large";
}

export interface EstimateInput {
  subject: SubjectInput;
  compute: ComputeInput;
  gridRegion?: string;
}

export interface EstimateResult {
  energyKWh: number;
  gCO2e: number;
  confidence: "low" | "med" | "high";
  methodologyVersion: string;
  gridIntensity: { gCO2ePerKWh: number; region: string };
  notes: string[];
}

// Deterministic estimate from AiEDs v1 factor tables.
// Priority: gpuSeconds > flops > tokens. "high" confidence requires direct power measurement
// (not available in this tool - use "med" for gpuSeconds + known hardware).
export function estimate(input: EstimateInput): EstimateResult {
  const notes: string[] = [];
  const { compute, gridRegion = "global_average" } = input;

  const grid = GRID_FACTORS[gridRegion] ?? GRID_FACTORS["global_average"];
  const gCO2ePerKWh = grid.gCO2ePerKWh;
  const effectiveRegion = GRID_FACTORS[gridRegion] ? gridRegion : "global_average";
  if (!GRID_FACTORS[gridRegion]) {
    notes.push(`Grid region '${gridRegion}' not in factor table; using global_average (${gCO2ePerKWh} gCO2e/kWh).`);
  }

  let energyKWh: number;
  let confidence: "low" | "med" | "high";

  if (compute.gpuSeconds !== undefined) {
    const hw = compute.hardware ? HARDWARE_FACTORS[compute.hardware] : undefined;
    const powerW = hw?.powerW ?? DEFAULT_POWER_W;
    if (compute.hardware && !hw) {
      notes.push(`Hardware '${compute.hardware}' not in factor table; using ${powerW}W default.`);
      confidence = "low";
    } else {
      confidence = hw ? "med" : "low";
    }
    energyKWh = (compute.gpuSeconds * powerW) / 3_600_000;
  } else if (compute.flops !== undefined) {
    const joules = (compute.flops / 1e12) * JOULES_PER_TFLOP;
    energyKWh = joules / 3_600_000;
    confidence = "low";
    notes.push(`FLOPs-based estimate uses ${JOULES_PER_TFLOP} J/TFLOP representative factor (FP16/BF16, A100/H100 class).`);
  } else if (compute.tokens !== undefined) {
    const scale = compute.modelScale ?? "default";
    const whPerMillion = TOKENS_WH_PER_MILLION[scale] ?? TOKENS_WH_PER_MILLION["default"];
    energyKWh = (compute.tokens / 1_000_000) * whPerMillion / 1000;
    confidence = "low";
    notes.push(`Token proxy uses ${whPerMillion} Wh/1M tokens (${scale} model scale). Provide gpuSeconds + hardware for higher confidence.`);
  } else {
    throw new Error("compute must include at least one of: gpuSeconds, flops, tokens.");
  }

  const gCO2e = energyKWh * gCO2ePerKWh;

  return {
    energyKWh: Math.round(energyKWh * 1_000_000) / 1_000_000,
    gCO2e: Math.round(gCO2e * 100) / 100,
    confidence,
    methodologyVersion: METHODOLOGY_VERSION,
    gridIntensity: { gCO2ePerKWh, region: effectiveRegion },
    notes,
  };
}

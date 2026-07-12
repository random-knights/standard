// AIEDS v1 factor tables — the single source of truth for deterministic estimation.
// Owner-ratified: changes require a methodology version bump (see methodology.md §6).

export const METHODOLOGY_VERSION = "1.2.0";

export interface HardwareFactor {
  powerW: number;
  description: string;
  source: string;
}

export interface GridFactor {
  gCO2ePerKWh: number;
  source: string;
}

// Hardware TDP values (watts). Used with gpuSeconds to derive energy.
// Source: manufacturer datasheets (TDP is an upper bound; actual draw is typically 60–95% TDP).
export const HARDWARE_FACTORS: Record<string, HardwareFactor> = {
  "NVIDIA H100 SXM":  { powerW: 700, description: "NVIDIA H100 SXM5 80GB",     source: "NVIDIA datasheet 2023" },
  "NVIDIA H100 PCIe": { powerW: 350, description: "NVIDIA H100 PCIe 80GB",      source: "NVIDIA datasheet 2023" },
  "NVIDIA A100 SXM":  { powerW: 400, description: "NVIDIA A100 SXM4 80GB",      source: "NVIDIA datasheet 2021" },
  "NVIDIA A100 PCIe": { powerW: 300, description: "NVIDIA A100 PCIe 80GB",      source: "NVIDIA datasheet 2021" },
  "NVIDIA V100 SXM":  { powerW: 300, description: "NVIDIA V100 SXM2 32GB",      source: "NVIDIA datasheet 2018" },
  "NVIDIA RTX 4090":  { powerW: 450, description: "NVIDIA GeForce RTX 4090",    source: "NVIDIA datasheet 2022" },
  "NVIDIA RTX 3090":  { powerW: 350, description: "NVIDIA GeForce RTX 3090",    source: "NVIDIA datasheet 2020" },
  "NVIDIA L40S":      { powerW: 350, description: "NVIDIA L40S 48GB",           source: "NVIDIA datasheet 2023" },
  "NVIDIA A40":       { powerW: 300, description: "NVIDIA A40 48GB",            source: "NVIDIA datasheet 2020" },
  "Google TPU v4":    { powerW: 170, description: "Google TPU v4 (per chip)",   source: "Google Cloud 2023" },
  "Google TPU v5e":   { powerW: 200, description: "Google TPU v5e (per chip)",  source: "Google Cloud 2024" },
};

// Grid carbon intensity by region (gCO2e / kWh, market average 2023).
export const GRID_FACTORS: Record<string, GridFactor> = {
  global_average: { gCO2ePerKWh: 436, source: "IEA World Energy Outlook 2023"      },
  US:             { gCO2ePerKWh: 386, source: "EPA eGRID 2023"                      },
  EU27:           { gCO2ePerKWh: 276, source: "EEA 2023"                            },
  UK:             { gCO2ePerKWh: 233, source: "DESNZ 2023"                          },
  France:         { gCO2ePerKWh:  85, source: "RTE 2023"                            },
  Germany:        { gCO2ePerKWh: 385, source: "UBA 2023"                            },
  Poland:         { gCO2ePerKWh: 746, source: "KOBiZE 2023"                         },
  China:          { gCO2ePerKWh: 530, source: "IEA 2023"                            },
  India:          { gCO2ePerKWh: 713, source: "CEA 2023"                            },
  Japan:          { gCO2ePerKWh: 463, source: "IEA 2023"                            },
  Canada:         { gCO2ePerKWh: 130, source: "CER 2023"                            },
  Australia:      { gCO2ePerKWh: 590, source: "DISER 2023"                          },
  Sweden:         { gCO2ePerKWh:  45, source: "Swedish Energy Agency 2023"          },
  Norway:         { gCO2ePerKWh:  29, source: "NVE 2023"                            },
};

// Token-to-energy proxy (Wh per million tokens) by model parameter scale.
// Confidence = low. Derived from published inference benchmarks on A100/H100 class hardware.
// Prefer gpuSeconds for higher confidence estimates.
export const TOKENS_WH_PER_MILLION: Record<string, number> = {
  small:   100,  // <7B parameters
  medium:  500,  // 7B–70B parameters
  large:  2000,  // >70B parameters
  default: 500,
};

// Energy-to-compute proxy for FLOP-based estimates.
// 0.35 J/TFLOP is representative for FP16/BF16 on A100/H100; confidence = low.
export const JOULES_PER_TFLOP = 0.35;

// Default hardware power (W) when hardware is specified but not in the table.
export const DEFAULT_POWER_W = 400;

# AIEDS v1 Methodology

> **License:** CC BY 4.0 rand0m.ai — [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

**Version:** 1.0.0 (AIEDS methodology semver — distinct from repo/MCP server versions)
**Status:** Ratified
**Effective:** 2026-06-29

## CHANGELOG

| Version | Date       | Changes |
|---------|------------|---------|
| 1.0.0   | 2026-06-29 | Initial ratification. GPU-seconds, FLOP, and token compute paths. Hardware TDP table (11 accelerators). Grid intensity table (14 regions). Three confidence levels. |

---

## 1. Scope and Non-Overlap

AIEDS measures **AI-system energy and CO₂e** at the subject level (a model, agent, or app). It is NOT the planetary Earth Health Score produced by `rand0m.ai/earthHealthScoreRefresh`. The two systems are independent:

| Dimension | AIEDS | Earth Health Score |
|-----------|-------|--------------------|
| Object | One AI subject | Planetary health |
| Unit | kWh / gCO₂e | 0–100 index |
| Scope | device / usage / inference / training | Global + regional biosphere |
| Update | Per-session or batch | Daily (06:10 UTC) |

AIEDS scope definitions:

- **device** — energy consumed by the client device (CPU, GPU, display) running an AI app.
- **usage** — device + server-side inference combined (full user-facing footprint).
- **inference** — server-side inference only (no client energy).
- **training** — a model training run. Factor tables are inference-optimised; apply training-specific measured values where available.

---

## 2. Compute → Energy

### 2.1 GPU-Seconds Path (preferred)

```
energyKWh = gpuSeconds × powerW / 3_600_000
```

`powerW` is the accelerator TDP from **Table 1** (§4). TDP is an upper bound; actual draw at sustained inference is typically 60–95% of TDP. Using TDP yields a conservative (slightly high) estimate, which is the correct bias for environmental disclosure.

**Confidence:** `med` when hardware is in Table 1; `low` when hardware is unknown (default 400 W applied).

### 2.2 FLOP Path

```
joules   = (flops / 1 × 10¹²) × J_per_TFLOP
energyKWh = joules / 3_600_000
```

`J_per_TFLOP = 0.35` is representative for FP16/BF16 on A100/H100-class hardware. Derived from published benchmarks. **Confidence: `low`.**

### 2.3 Token Proxy Path (fallback)

```
energyKWh = (tokens / 1_000_000) × Wh_per_million / 1_000
```

`Wh_per_million` by model scale from **Table 2** (§4). This path is order-of-magnitude only; hardware utilisation, batch size, and serving efficiency dominate actual consumption. **Confidence: `low`.**

---

## 3. Energy → CO₂e

```
gCO2e = energyKWh × gCO2ePerKWh
```

`gCO2ePerKWh` is the grid carbon intensity for the declared region from **Table 3** (§4). Use the grid that served the inference or device workload. When unknown, use `global_average` (436 gCO₂e/kWh, IEA 2023).

---

## 4. Factor Tables

### Table 1 — Hardware Power Draw (TDP, Watts)

| Hardware | TDP (W) | Source |
|----------|---------|--------|
| NVIDIA H100 SXM | 700 | NVIDIA datasheet 2023 |
| NVIDIA H100 PCIe | 350 | NVIDIA datasheet 2023 |
| NVIDIA A100 SXM | 400 | NVIDIA datasheet 2021 |
| NVIDIA A100 PCIe | 300 | NVIDIA datasheet 2021 |
| NVIDIA V100 SXM | 300 | NVIDIA datasheet 2018 |
| NVIDIA RTX 4090 | 450 | NVIDIA datasheet 2022 |
| NVIDIA RTX 3090 | 350 | NVIDIA datasheet 2020 |
| NVIDIA L40S | 350 | NVIDIA datasheet 2023 |
| NVIDIA A40 | 300 | NVIDIA datasheet 2020 |
| Google TPU v4 (per chip) | 170 | Google Cloud 2023 |
| Google TPU v5e (per chip) | 200 | Google Cloud 2024 |

Default (unknown hardware): **400 W** (approximate A100 PCIe).

### Table 2 — Token Energy Proxy (Wh per million tokens)

| Scale | Parameters | Wh / 1M tokens |
|-------|-----------|----------------|
| small | < 7B | 100 |
| medium | 7B – 70B | 500 |
| large | > 70B | 2 000 |

Derived from published A100/H100 inference benchmarks. These are rough order-of-magnitude figures; provide `gpuSeconds + hardware` for higher confidence.

### Table 3 — Grid Carbon Intensity (gCO₂e / kWh, 2023 market average)

| Region | gCO₂e/kWh | Source |
|--------|-----------|--------|
| global_average | 436 | IEA World Energy Outlook 2023 |
| US | 386 | EPA eGRID 2023 |
| EU27 | 276 | EEA 2023 |
| UK | 233 | DESNZ 2023 |
| France | 85 | RTE 2023 |
| Germany | 385 | UBA 2023 |
| Poland | 746 | KOBiZE 2023 |
| China | 530 | IEA 2023 |
| India | 713 | CEA 2023 |
| Japan | 463 | IEA 2023 |
| Canada | 130 | CER 2023 |
| Australia | 590 | DISER 2023 |
| Sweden | 45 | Swedish Energy Agency 2023 |
| Norway | 29 | NVE 2023 |

---

## 5. Confidence Levels

| Level | Meaning | Typical path |
|-------|---------|-------------|
| `high` | Direct hardware power measurement (e.g. NVIDIA SMI, IPMI, PDU). | Power meter → kWh |
| `med` | GPU-seconds × known TDP from Table 1. | `gpuSeconds + hardware` |
| `low` | Token proxy (Table 2), FLOP proxy, or hardware not in Table 1. | `tokens`, `flops`, or unknown hardware |

Fractional confidence (0–1) may be substituted for the string enum when a probabilistic derivation is available.

---

## 6. Governance

Factor tables and methodology changes are **owner-ratified** (mirrors ADR 0008 / CODEX versioning policy):

1. A methodology change (factor value, new hardware, new region, path change) **must** bump the methodology version in this file and in `mcp/src/factors.ts`.
2. All three must stay in sync: `methodology.md` version, `METHODOLOGY_VERSION` in `factors.ts`, and the version recorded in every disclosure's `methodologyVersion` field.
3. No silent drift: the CHANGELOG at the top of this file is append-only. Old versions remain in git history for auditability.
4. The schema (`aieds.schema.json`) is MIT-licensed; methodology content (`methodology.md`) is CC BY 4.0. Forks may adapt the methodology but must attribute and use a distinct version prefix.

---

## 7. Interoperability

AIEDS disclosures are designed to interoperate with:

- **Hugging Face `co2_eq_emissions`** — the `gCO2e` field maps directly to HF's `co2_eq_emissions` (unit: grams). `source` maps to `training_type`/`framework`. `scope` maps to HF's `training_type` field where applicable.
- **EU AI Act model documentation** — the `energyKWh` and `gCO2e` fields satisfy the Act's Art. 13(3)(b)(iv) energy-consumption disclosure requirement. `confidence` and `methodologyVersion` support the transparency and accuracy obligations.
- **ISO 14064-1 / GHG Protocol** — `scope` maps to Scope 2 (grid electricity) for inference and device disclosures. Training may include Scope 1 where on-site generation is used.

---

## 8. Out of Scope (v1)

Deferred to v1.1+:

- Read API / SDK for ingesting disclosures from external producers.
- `.well-known/aieds.json` auto-discovery endpoint.
- Scope 3 embodied carbon (hardware manufacture).
- Real-time grid intensity (live carbon-aware scheduling).

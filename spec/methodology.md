# AIEDS Methodology

> **CURRENT VERSION: 2.0.0. Versions 1.x are SUPERSEDED and MUST NOT be
> implemented.** 1.x specified a flat 0.30 gCO2e per 1k tokens for every model
> and derived energy backward from carbon. Both are wrong. Implement 2.0.0 (see
> the changelog below and `README.md`). Do not pick up 1.0.0 because it reads
> like a stable base; it is not.

> **License:** CC BY 4.0 rand0m.ai — [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

**Version:** 2.0.0 (AIEDS methodology semver — distinct from repo/MCP server versions)
**Status:** Ratified
**Effective:** 2026-07-12

## CHANGELOG

| Version | Date       | Changes |
|---------|------------|---------|
| 2.0.0   | 2026-07-12 | **MAJOR (breaking).** ENERGY-FIRST response surface (§2.4 v2): energy-first derivation replaces the flat 0.30 gCO2e/1k-token constant and the carbon-first inversion. The SAME input now yields DIFFERENT output (a typical exchange moves 0.375 g -> 0.103 g), so under semver this is a breaking change, NOT the minor 1.2.0 it was briefly cut as (see tagging note). Per-model Wh/1k-token coefficients with confidence tiers + citations; carbon derived from energy; impact-model version stamp (`v2`) on disclosures and usage rows; aggregates must not blend versions; Mature Reference Tree unified at 21 kg CO2e/yr. |
| 1.1.0   | 2026-07-11 | Metric hierarchy (§1.1). Carbon-first response-surface path (§2.4) with pinned app-surface grid intensity (429). Level-3 human equivalencies incl. Tree-Time (§2.5). Response-surface confidence ladder mapping (§5.1). Reference library (`/lib`). Additive only. |
| 1.0.0   | 2026-06-29 | Initial ratification. GPU-seconds, FLOP, and token compute paths. Hardware TDP table (11 accelerators). Grid intensity table (14 regions). Three confidence levels. |

> **Tagging note (2026-07-12):** the repo carried no git tags until 2026-07-12.
> On that date, annotated tags `v1.0.0` (commit `7f548c1`) and `v1.1.0` (commit
> `a09812a`) were cut RETROACTIVELY so each ratified version has an artifact;
> their releases state plainly that they are backfills, not tags that existed at
> the time. The 1.1.0 date above was corrected from a previously-claimed
> 2026-07-09 to 2026-07-11, the actual commit date (no commit corroborated
> 2026-07-09). The current ratification was briefly cut as `v1.2.0` (a MINOR
> bump) on 2026-07-12 and RETRACTED the same day, because the change is breaking
> and a minor version misstates compatibility; it was re-published as `v2.0.0`.
> `v1.0.0` and `v1.1.0` remain tagged (deleting them would recreate a changelog
> that claims versions with no artifacts) but are SUPERSEDED and must not be
> implemented.

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

### 1.1 Metric Hierarchy

Every AIEDS disclosure is read top-down through three levels. Lower levels are
derived from (never a substitute for) the level above:

| Level | Class | Metrics | Nature |
|-------|-------|---------|--------|
| 1 | **Modeled scientific estimates** | `energyKWh`/`energyWh`, `gCO2e` | The disclosure's substance. Modeled via §2–§3 (forward) or §2.4 (carbon-first). |
| 2 | **Operational metrics** | tokens in/out, cost, latency | Facts of the run, passed through untransformed. |
| 3 | **Human equivalencies** | Tree-Time, phone charges, LED-bulb hours, laptop minutes, driving meters | Educational comparisons ONLY (§2.5). Never compliance figures, never offset/restoration claims. |

Required copy on every rendered disclosure: *"Energy and carbon are modeled
estimates."* and *"Tree-Time and equivalents are educational comparisons."*

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

### 2.4 Response-Surface Path (v2: ENERGY-FIRST)

> **1.2.0:** the 1.1.0 carbon-first inversion is RETIRED for cloud
> responses. Carbon, energy, and tree-time were one multiply printed in three
> units; v2 makes energy the primary quantity and derives carbon from it.

Cloud chat/agent responses carry token counts. Energy comes from a per-model
coefficient table (output tokens cost 4x input per token: decode is
sequential, prefill is parallel; provider pricing ratios run 3-5x):

```
energyWh  = inTok/1000 x whPer1kIn[model] + outTok/1000 x whPer1kOut[model]
energyWh x= pue[provider]      (1.0 when the vendor basis figure is all-in)
carbonG   = energyWh/1000 x 429
```

Every coefficient carries a CONFIDENCE TIER and a CITATION (the honesty
contract - a number without provenance does not belong in the table):

| tier | meaning |
| --- | --- |
| measured | we benchmarked it |
| vendor-published | provider published a figure (cited; split assumptions noted) |
| class-estimated | inferred from model class; no provider figure exists |
| unknown | nothing sourceable; class fallback, labeled unknown |

Reference coefficients (mirrors `rk_ai ai_impact.dart`, citations there):
gemini 0.12/0.48 Wh per 1k in/out, PUE 1.0, vendor-published (Google Aug
2025, arXiv:2508.15734: 0.24 Wh median prompt); gpt/o* 0.17/0.68, PUE 1.0,
vendor-published (OpenAI blog Jun 2025: ~0.34 Wh avg query, blog-grade);
claude 0.145/0.58, PUE 1.2, class-estimated (no Anthropic figure as of
2026-01); grok + unmatched: the class fallback, labeled unknown.

Disclosures and usage rows are stamped `aiedsImpactModelVersion` (currently
`v2`); aggregates MUST NOT blend rows across impact-model versions.

DEVICE scope (local inference) already measured energy forward
(modeled watts x elapsed) and is unchanged.

Legacy (1.1.0) carbon-first inversion, kept ONLY for reading v1-era rows:

```
energyWh = carbon_g_co2e / 429 x 1000
```

`429 gCO₂e/kWh` is the **pinned app-surface modeled global grid intensity**.
It is deliberately its own constant, distinct from Table 3's `global_average`
(436): the shipped rand0m.ai app disclosed with 429 from AIEDS v1 day one, and
the standard follows the shipped number rather than silently diverging from
every disclosure already rendered. Changing either constant is a methodology
change (owner-ratified; §6). The reference implementation of this path is
[`/lib`](../lib/) — it byte-mirrors the app's `aieds_disclosure.dart`.

Negative or missing carbon clamps to zero. **Confidence:** `estimated` (§5.1).

### 2.5 Human Equivalencies (Level 3)

Educational comparisons derived from the Level-1 metrics. Formulas and pinned
constants (all illustrative, modeled):

| Equivalency | Formula | Constant |
|-------------|---------|----------|
| **Tree-Time** (minutes) | `carbon_g / 22 000 × 525 600` | 1 Mature Reference Tree (MRT) sequesters 22 kg CO₂e/year |
| Phone charges | `energyWh / 12` | 12 Wh per full charge |
| LED-bulb hours | `energyWh / 10` | 10 W bulb |
| Laptop minutes | `energyWh / 50 × 60` | 50 W laptop |
| Driving meters | `carbon_g / 170 × 1000` | 170 gCO₂e/km average car |

Tree-Time is AIEDS's signature equivalency: how long one mature reference tree
takes to sequester the disclosed carbon. Equivalencies MUST be labeled
educational and MUST NOT be presented as offsets, credits, or restoration.

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

### 5.1 Response-Surface Confidence Ladder

Response surfaces (the §2.4 path, the rand0m.ai app, `/lib`) use a four-rung
ladder; the two enums map as follows:

| Response-surface rung | Meaning | Estimation-path equivalent |
|-----------------------|---------|---------------------------|
| `estimated` | Carbon inverted from a client/provider heuristic. | `low` |
| `modeled` | Carbon from a documented model (factor tables, measured sample). | `low`–`med` |
| `provider-derived` | Provider-reported telemetry. Requires an approved evidence phase. | `med`–`high` |
| `verified` | Independently verified measurement. Requires an approved evidence phase. | `high` |

AIEDS v1 disclosures use `estimated` or `modeled` only.

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

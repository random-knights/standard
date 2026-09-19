# AiEDs Methodology

> **CURRENT VERSION: 2.3.0. Versions 1.x are SUPERSEDED and MUST NOT be
> implemented.** 1.x specified a flat 0.30 gCO2e per 1k tokens for every model
> and derived energy backward from carbon. Both are wrong. Implement 2.3.0 (see
> the changelog below and `README.md`). Do not pick up 1.0.0 because it reads
> like a stable base; it is not. 2.0.0, 2.1.0 and 2.2.0 records remain valid:
> 2.1.0 is clarifying, and 2.2.0 and 2.3.0 are additive; none changes an
> existing number.

> **License:** CC BY 4.0 rand0m.ai - [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

**Version:** 2.3.0 (AiEDs methodology semver - distinct from repo/MCP server versions)
**Status:** Ratified
**Effective:** 2026-09-19
**Author:** Random Knights, LLC, ORCID https://orcid.org/0009-0006-5066-1693

## CHANGELOG

| Version | Date       | Changes |
|---------|------------|---------|
| 2.3.0   | 2026-09-19 | **MINOR (additive). No existing number changes; 2.0.0, 2.1.0 and 2.2.0 records remain valid.** WHAT CHANGED: new section 2.3.2 and Table 4b, MEASURED PREFILL COEFFICIENTS BY PROMPT-LENGTH BAND, publishing what 2.2.0 left UNRESOLVED. Owner decision on RK-16 (2026-09-18): publish prefill stratified by prompt length rather than rent an H100 hour or wait for a shape that fits the convex curve. THE SHAPE: three bands (short, under 256 prompt tokens; medium, 256 to under 2048; long, 2048 and over), boundaries inclusive on the lower end, chosen from the sample's own three prompt-length tiers. Each band publishes the RUN COUNT and the MEDIAN and INTERQUARTILE RANGE of Wh per million tokens observed in it, not a fitted line: no shape is assumed, so no shape can be mis-specified. THE NUMBER: no published figure moves. Table 2, Table 4's two decode rows, both grid intensities and every constant are byte-identical to 2.2.0; the two prefill rows that were on the "Table 4 unresolved" list are REMOVED from that list (both models now have band figures) and that list is empty as of this version. THE SCOPE FENCE IS UNCHANGED: a band figure describes only the named hardware, runtime, model and quantization; it MUST NOT be applied to hosted inference, which remains `class-estimated` with `low` confidence. WHAT DID NOT CHANGE: the provenance ladder, the confidence ladder, the response-surface path, the schema, decode's published two-term coefficients, the Mature Reference Tree, the two grid values. The reference library (`lib/`) gains a band-selection function reading these bands by prompt token count; it is additive and does not touch the response-surface disclosure path. EVIDENCE AND REPRODUCE: same raw samples as 2.2.0, no new measurement; the measurement harness now also emits `prefillBands` per session (see section 2.3.2), and `node harness/emit-factor-entry.mjs table` emits Table 4b's rows from the same committed bytes. |
| 2.2.0   | 2026-09-15 | **MINOR (additive). No existing number changes; 2.0.0 and 2.1.0 records remain valid.** WHAT CHANGED: new section 2.3.1 and Table 4, MEASURED DEVICE COEFFICIENTS, fitted as a TWO-TERM model `energyWh = a + b * tokens` per phase and per device by ordinary least squares over 36 varied runs, with 95 percent intervals on both terms and the residual diagnostics that say whether the line fits. `a` is a per-request FIXED cost and `b` the marginal per-token cost. THE NUMBER: no published figure moves. Table 2's class estimates, every hosted coefficient, both grid intensities and every constant are byte-identical to 2.1.0; this version only ADDS a table that was not there. WHY IT IS TWO TERMS: a single Wh-per-million-tokens figure divides a fixed per-request cost by a varying token count, which is not a constant. Measured on the first device, the pooled figure came out with an interquartile range wider than its own median, and the fit shows why. A per-request fixed cost is a NEW disclosure shape that sections 2.1 to 2.4 cannot express. WHAT DID NOT CHANGE: the provenance ladder, the confidence ladder, the response-surface path, the schema, the Mature Reference Tree, the two grid values, and every hosted profile. Hosted calls have no measured intercept and stay `class-estimated` with `low` confidence. WHAT IS NOW UNRESOLVED: PREFILL on both measured models. A quadratic term in tokens is significant there (p below 1e-13), so energy is convex in token count rather than affine, the fitted intercept is a curvature artifact rather than a fixed cost, and the fitted line predicts negative energy inside the observed range. UNRESOLVED, not NOT-APPLICABLE: prefill applies and its energy was measured; the two-term shape cannot carry it. DECODE is published, and its intercept is NOT distinguishable from zero on either model, which is the result the two-term model predicts and is evidence the shape is right where it is used. EVIDENCE AND REPRODUCE: method document, harness, and every raw power sample are published under `spec/measurements/`; `node harness/summarise.mjs` recomputes every figure in Table 4 from the committed raw data. |
| 2.1.0   | 2026-09-12 | **MINOR (clarifying). No number changes; 2.0.0 records remain valid.** Section 5.1 becomes the PROVENANCE ladder: `measured`, `vendor-published`, `class-estimated`, `synthetic`, `unknown`, strongest first, matching what the schema's `provenance` text already describes. `synthetic` is new and means the producer KNOWS it generated the input; `unknown` means the source cannot be characterised at all, and recording a generated input as `unknown` understates it (owner ruling, 2026-09-11). The 2.0.0 rungs `estimated`, `modeled`, `provider-derived`, `verified` are retired to a legacy-terms note with a reading mapping. `confidence` is stated to be the producer's overall confidence in the energy figure, defaulting to `low` for any token-proxy method. New section 2.4.1, cached prefill: cache-creation and cache-read tokens are counted as input, the breakdown is published alongside the total when the provider reports it, and charging cache reads at the full input coefficient is named as a conservative bias rather than a measurement. No new coefficient. The schema is NOT edited in this version: its `provenance` enum is closed at four rungs and `compute` has no field for the token breakdown, so both are written up as a 2.2.0 schema proposal and a machine-validated record cannot carry `synthetic` until then. |
| 2.0.0   | 2026-07-12 | **MAJOR (breaking).** ENERGY-FIRST response surface (section 2.4 v2): energy-first derivation replaces the flat 0.30 gCO2e/1k-token constant and the carbon-first inversion. The SAME input now yields DIFFERENT output (a typical exchange moves 0.375 g -> 0.103 g), so under semver this is a breaking change, NOT the minor 1.2.0 it was briefly cut as (see tagging note). Per-model Wh/1k-token coefficients with confidence tiers + citations; carbon derived from energy; impact-model version stamp (`v2`) on disclosures and usage rows; aggregates must not blend versions; Mature Reference Tree unified at 21 kg CO2e/yr. |
| 1.1.0   | 2026-07-11 | Metric hierarchy (section 1.1). Carbon-first response-surface path (section 2.4) with pinned app-surface grid intensity (429). Level-3 human equivalencies incl. Tree-Time (section 2.5). Response-surface confidence ladder mapping (section 5.1). Reference library (`/lib`). Additive only. |
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

AiEDs measures **AI-system energy and CO2e** at the subject level (a model, agent, or app). It is NOT the planetary Earth Health Score produced by `rand0m.ai/earthHealthScoreRefresh`. The two systems are independent:

| Dimension | AiEDs | Earth Health Score |
|-----------|-------|--------------------|
| Object | One AI subject | Planetary health |
| Unit | kWh / gCO2e | 0 to 100 index |
| Scope | device / usage / inference / training | Global + regional biosphere |
| Update | Per-session or batch | Daily (06:10 UTC) |

AiEDs scope definitions:

- **device** - energy consumed by the client device (CPU, GPU, display) running an AI app.
- **usage** - device + server-side inference combined (full user-facing footprint).
- **inference** - server-side inference only (no client energy).
- **training** - a model training run. Factor tables are inference-optimized; apply training-specific measured values where available.

### 1.1 Metric Hierarchy

Every AiEDs disclosure is read top-down through three levels. Lower levels are
derived from (never a substitute for) the level above:

| Level | Class | Metrics | Nature |
|-------|-------|---------|--------|
| 1 | **Modeled scientific estimates** | `energyKWh`/`energyWh`, `gCO2e` | The disclosure's substance. Modeled via sections 2 to 3 (forward) or section 2.4 (carbon-first). |
| 2 | **Operational metrics** | tokens in/out, cost, latency | Facts of the run, passed through untransformed. |
| 3 | **Human equivalencies** | Tree-Time, phone charges, LED-bulb hours, laptop minutes, driving meters | Educational comparisons ONLY (section 2.5). Never compliance figures, never offset/restoration claims. |

Required copy on every rendered disclosure: *"Energy and carbon are modeled
estimates."* and *"Tree-Time and equivalents are educational comparisons."*

---

## 2. Compute -> Energy

### 2.1 GPU-Seconds Path (preferred)

```
energyKWh = gpuSeconds x powerW / 3_600_000
```

`powerW` is the accelerator TDP from **Table 1** (section 4). TDP is an upper bound; actual draw at sustained inference is typically 60 to 95% of TDP. Using TDP yields a conservative (slightly high) estimate, which is the correct bias for environmental disclosure.

**Confidence:** `med` when hardware is in Table 1; `low` when hardware is unknown (default 400 W applied).

### 2.2 FLOP Path

```
joules   = (flops / 1 x 10^12) x J_per_TFLOP
energyKWh = joules / 3_600_000
```

`J_per_TFLOP = 0.35` is representative for FP16/BF16 on A100/H100-class hardware. Derived from published benchmarks. **Confidence: `low`.**

### 2.3 Token Proxy Path (fallback)

```
energyKWh = (tokens / 1_000_000) x Wh_per_million / 1_000
```

`Wh_per_million` by model scale from **Table 2** (section 4). This path is order-of-magnitude only; hardware utilization, batch size, and serving efficiency dominate actual consumption. **Confidence: `low`.**

### 2.3.1 Measured Device Coefficients, two-term (2.2.0)

A MEASURED DEVICE COEFFICIENT is obtained by sampling the accelerator's own
power telemetry while a named model runs on a named machine, subtracting a
measured idle baseline, and FITTING the result rather than averaging it:

```
energyWh = a + b x tokens
```

`a` is a PER-REQUEST FIXED COST, in Wh per request. `b` is the MARGINAL
per-token cost, in Wh per token; Table 4 states it per million tokens so it can
be read against Table 2. Prefill and decode are fitted separately and carry
their own `a` and `b`.

**Why two terms and not one.** Every other path in this document expresses
energy as a rate times a count. That shape cannot represent a cost a request
pays once. Dividing a fixed cost by a varying token count does not give a
constant, it gives a number that falls as requests get longer, and the first
device measured under this section produced exactly that: a single
Wh-per-million-tokens figure whose interquartile range was wider than its own
median. The spread was not noise. It was a missing term.

**A per-request fixed cost is a NEW disclosure shape.** No AiEDs record before
2.2.0 could carry one. A producer using this path publishes both terms and both
intervals, and MUST NOT collapse them into a single per-token figure, because
collapsing them is what the pooled figure already showed to be meaningless.

**THE SCOPE FENCE, and it is normative.** A measured device coefficient
describes only the hardware, runtime, model and quantization it names. It MUST
NOT be applied to any other system, and in particular MUST NOT be applied to
hosted inference. A real measurement of one machine, presented as the energy of
a different machine, is a worse disclosure than an honest class estimate: it
carries the authority of a measurement and none of the applicability. Hosted API
calls expose neither GPU-seconds nor watts to the caller, have NO measured
intercept, and remain `class-estimated` with `low` confidence. No better
arithmetic changes that, and a measured `a` from Table 4 is never carried onto a
hosted profile.

**Fitting is not optional, and neither is checking the fit.** A two-term entry
is publishable only when all of these are stated, and
`spec/test/measured-devices.test.mjs` refuses an entry that omits any:

1. The estimator (ordinary least squares) and the design: at least 30 runs
   spanning at least three token counts.
2. Both terms with 95 percent intervals, by a stated method. Table 4's intervals
   are t-based on `n - 2` degrees of freedom; a seeded percentile bootstrap over
   pairs is published beside them as a distribution-free cross-check, and the
   two agreeing is part of the evidence.
3. `r2` and the residual standard error.
4. A CURVATURE TEST. The fit is refitted with a quadratic term in tokens. If
   that term is significant, the affine model is MIS-SPECIFIED and the entry is
   NOT published: a straight line through a curve has whatever intercept it
   needs at zero tokens to compensate, which is not a fixed cost and can be
   negative.
5. Whether `a` is distinguishable from zero. An interval straddling zero is a
   real and useful result, not a failure: it says that phase has no measurable
   fixed cost.

**Choosing between Table 2 and Table 4.** They answer different questions:

| You know | Use | Confidence |
|----------|-----|-----------|
| The exact machine, runtime, model and quantization, and Table 4 has that row | Table 4 | `high` |
| The machine class only, or the workload ran somewhere you cannot name | Table 2 | `low` |
| A machine Table 4 does not list, even a similar one | Table 2 | `low` |

The third row is the one that matters. A coefficient measured on a laptop part
does not become a coefficient for the desktop part of the same name, a different
driver, a different quantization of the same model, or a different serving
runtime. Each changes the number, and the way to find out by how much is to
measure it.

**Measurement scope is not a footnote.** A tool that reports one component's
power measures that component. Table 4's first entries were taken with
`nvidia-smi`, which reports the discrete GPU's BOARD power, so host CPU, system
memory and any integrated GPU are NOT included. Such a figure is disclosed as
"dGPU board power during inference" and never as system power. A tool reporting
package power rather than board power is a different measurement again and must
be labeled as such.

**Cached prefill (section 2.4.1) and the two-term shape.** Where a prefill entry
is published as a two-term coefficient, the two terms make a cached prefill
checkable: a cache read should show a near-zero contribution from `b` while
still paying `a`. NOTE that no device has yielded a two-term prefill fit that
passes the curvature test as of 2.3.0 (both measured models are published BY
BAND instead; see section 2.3.2), so this remains a property of the shape and
not yet an observation. A band figure has no `a`/`b` split and does not make
cached prefill checkable; that becomes available when a device yields a
two-term prefill fit that passes the curvature test.

### 2.3.2 Prefill by Prompt-Length Band (2.3.0)

Section 2.3.1's two-term fit is MIS-SPECIFIED for prefill on both measured
models (Table 4b below; formerly Table 4's unresolved list under 2.2.0): a
quadratic term in tokens is significant, so per-token prefill energy is not
constant across prompt lengths. THE MECHANISM: board power ramps from idle
toward the device's ceiling over roughly a second at the start of a request.
A SHORT prefill finishes before the ramp does and averages a low power; a LONG
prefill spends most of its window at the ceiling and averages a much higher
one. A single blended coefficient states neither figure correctly, which is
exactly the defect the RK-16 harness found: the pooled interquartile range
came out wider than its own median.

2.3.0 resolves this without fitting a curve. The measured runs are grouped
into three PROMPT-LENGTH BANDS, and each band's own energy-per-token figures
are reported as a DISTRIBUTION (run count, median and interquartile range),
not a fitted line. No shape is assumed, so no shape can be mis-specified, and
nothing is modeled or extrapolated between bands: each band's number describes
only the requests actually measured in it.

**Band boundaries**, chosen from the sample's own prompt-length distribution
(three tiers around 250, 1500 and 4350 tokens; see
`spec/measurements/2026-09-14-rtx-3060-laptop/README.md`), not fitted, and
INCLUSIVE ON THE LOWER END:

| Band | Prompt tokens |
|------|----------------|
| short | under 256 |
| medium | 256 to under 2048 |
| long | 2048 and over |

**Band selection.** A consumer selects a row by counting the prompt's own
input tokens and finding the band whose range contains that count. A prompt of
exactly 256 tokens is medium, not short; a prompt of exactly 2048 tokens is
long, not medium.

**THE SCOPE FENCE, restated (it does not change with the shape).** A band
figure describes only the named hardware, runtime, model and quantization,
measured at the prompt lengths observed in that band. It MUST NOT be applied
to any other system, and in particular MUST NOT be applied to hosted
inference. Hosted calls remain `class-estimated` with `low` confidence; no
band figure is carried onto a hosted profile, and the same test that enforces
this for Table 4's two-term entries
(`spec/test/measured-devices.test.mjs`) enforces it for the bands.

**What is published per band:** the run count, the median and interquartile
range of Wh per million tokens observed in the band, and the minimum and
maximum. The 12 runs per band here are the full set collected at that prompt
length, not a subsample chosen to look clean; `promptTokensObservedMin` and
`promptTokensObservedMax` in the published data name exactly what was
measured.

Table 4b, section 4, carries the published bands. `node harness/summarise.mjs`
recomputes them from the same committed raw samples Table 4 and its formerly
unresolved prefill rows were built from.

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

`429 gCO2e/kWh` is the **pinned app-surface modeled global grid intensity**.
It is deliberately its own constant, distinct from Table 3's `global_average`
(436): the shipped rand0m.ai app disclosed with 429 from AiEDs v1 day one, and
the standard follows the shipped number rather than silently diverging from
every disclosure already rendered. Changing either constant is a methodology
change (owner-ratified; section 6). The reference implementation of this path is
[`/lib`](../lib/) - it byte-mirrors the app's `aieds_disclosure.dart`.

Negative or missing carbon clamps to zero. **Confidence:** `low`; this path is a
token proxy (section 5). **Provenance:** the rung the coefficient carries, from
the section 5.1 ladder. The tier column in the table above IS that ladder; 2.1.0
renamed it from "confidence tier" to `provenance`, because it grades the
coefficient and not the energy figure.

### 2.4.1 Cached prefill (2.1.0)

Providers that cache a prompt prefix report the input in parts: plain input
tokens, cache-creation tokens, and cache-read tokens. All three are INPUT, and
all three are counted at `whPer1kIn`:

```
inTok = plainIn + cacheCreationIn + cacheReadIn
```

Publish the breakdown alongside the total whenever the provider reports it. A
reader who can see that most of an exchange was a cache read can judge the
figure; a reader given only a total cannot. The total is unchanged by publishing
the breakdown, so this costs nothing in comparability.

Charging cache reads at the full input coefficient is a CONSERVATIVE BIAS, not a
measurement. A cache read almost certainly draws less energy than recomputing
the prefill it replaces. No provider publishes the ratio, so AiEDs does not
invent one, and no new coefficient is introduced in 2.1.0. A figure that is
knowingly high in a stated direction is honest; a figure discounted by a guessed
ratio is not. When a provider publishes a cache-read energy figure it becomes a
coefficient with a citation, through the section 6 governance route.

**Schema constraint (2.1.0).** `compute` in the published schema carries
`tokens`, `gpuSeconds`, `flops` and `hardware`, with `additionalProperties`
false, so there is no field for the breakdown. A schema-conformant record
therefore carries the TOTAL in `compute.tokens`, unchanged, and publishes the
breakdown beside the record until a schema revision adds fields for it. That
revision had not been made as of methodology 2.2.0; see the note in section 5.1.

### 2.5 Human Equivalencies (Level 3)

Educational comparisons derived from the Level-1 metrics. Formulas and pinned
constants (all illustrative, modeled):

| Equivalency | Formula | Constant |
|-------------|---------|----------|
| **Tree-Time** (minutes) | `carbon_g / 21 000 x 525 600` | 1 Mature Reference Tree (MRT) sequesters 21 kg CO2e/year (v2 unified; v1 used 22 kg) |
| Phone charges | `energyWh / 12` | 12 Wh per full charge |
| LED-bulb hours | `energyWh / 10` | 10 W bulb |
| Laptop minutes | `energyWh / 50 x 60` | 50 W laptop |
| Driving meters | `carbon_g / 170 x 1000` | 170 gCO2e/km average car |

Tree-Time is AiEDs's signature equivalency: how long one mature reference tree
takes to sequester the disclosed carbon. Equivalencies MUST be labeled
educational and MUST NOT be presented as offsets, credits, or restoration.

---

## 3. Energy -> CO2e

```
gCO2e = energyKWh x gCO2ePerKWh
```

`gCO2ePerKWh` is the grid carbon intensity for the declared region from **Table 3** (section 4). Use the grid that served the inference or device workload. When unknown, use `global_average` (436 gCO2e/kWh, IEA 2023).

---

## 4. Factor Tables

### Table 1 - Hardware Power Draw (TDP, Watts)

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

### Table 2 - Token Energy Proxy (Wh per million tokens)

| Scale | Parameters | Wh / 1M tokens |
|-------|-----------|----------------|
| small | < 7B | 100 |
| medium | 7B to 70B | 500 |
| large | > 70B | 2 000 |

Derived from published A100/H100 inference benchmarks. These are rough order-of-magnitude figures; provide `gpuSeconds + hardware` for higher confidence.

### Table 3 - Grid Carbon Intensity (gCO2e / kWh, 2023 market average)

| Region | gCO2e/kWh | Source |
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

### Table 4 - Measured Device Coefficients (two-term, section 2.3.1)

`a` is the per-request fixed cost in Wh per request; `b` is the marginal cost in
Wh per million tokens. Both cells carry the 95 percent interval in parentheses.
Every row is a direct board-power measurement of the named machine and applies
to that machine ONLY (section 2.3.1, scope fence).

| Device | Runtime | Model | Quantization | Phase | a, Wh per request (95% CI) | b, Wh per million tokens (95% CI) | Runs |
|--------|---------|-------|--------------|-------|---------------------------|-----------------------------------|------|
| NVIDIA GeForce RTX 3060 Laptop GPU | Ollama 0.34.0 | llama3.2:1b | Q8_0 | decode | -0.001692 (-0.004049 to 0.000665) | 99.273 (90.969 to 107.577) | 36 |
| NVIDIA GeForce RTX 3060 Laptop GPU | Ollama 0.34.0 | llama3.2:latest | Q4_K_M | decode | -0.001838 (-0.004996 to 0.001319) | 197.467 (186.343 to 208.592) | 36 |

On BOTH published rows `a` is NOT distinguishable from zero at 95 percent: the
interval straddles it. That is the result the two-term model predicts for
decode, which runs at the device's power ceiling for essentially its whole
window, and it is evidence that the shape is right where it is used rather than
an embarrassment to be rounded away. A consumer may take `a` as zero for these
rows and MUST carry the interval.

Scope, for every row above: discrete GPU board power via `nvidia-smi
power.draw`, accurate to within +/- 5 W by NVIDIA's own statement. Host CPU,
system memory and the integrated GPU are NOT measured. Batch size 1, context
8192, loaded-idle baseline subtracted, post-response power decay excluded from
both terms and published separately. Method, harness and raw samples:
`spec/measurements/2026-09-14-rtx-3060-laptop/`.

A quadratic term in tokens is significant on both measured models (p below
1e-13), so prefill energy is CONVEX in token count rather than affine and no
two-term prefill row is published here. Fitting a straight line to that gives
a NEGATIVE intercept that predicts negative energy inside the observed range,
which is not physical. A two-term prefill row returns when a device yields a
fit that passes the curvature test, or when a shape that can represent the
ramp is ratified. Until then, prefill is published BY BAND: see Table 4b.

### Table 4b - Measured Prefill Coefficients by Prompt-Length Band (section 2.3.2)

Wh per million tokens: the median and interquartile range (Q1 to Q3) of the
runs observed in that band. No curve is fitted; see section 2.3.2 for why.
Scope identical to Table 4: discrete GPU board power via `nvidia-smi
power.draw`, loaded-idle baseline subtracted, batch size 1, context 8192,
post-response power decay excluded and published separately. Method, harness
and raw samples: `spec/measurements/2026-09-14-rtx-3060-laptop/`.

| Device | Model | Quantization | Band | Prompt tokens | Runs | Median (Wh/1M tok) | IQR, Q1 to Q3 (Wh/1M tok) |
|--------|-------|---------------|------|-----------------|------|----------------------|-----------------------------|
| NVIDIA GeForce RTX 3060 Laptop GPU | llama3.2:1b | Q8_0 | short | 0 to < 256 | 12 | 2.474 | 1.163 to 3.591 |
| NVIDIA GeForce RTX 3060 Laptop GPU | llama3.2:1b | Q8_0 | medium | 256 to < 2048 | 12 | 2.848 | 2.7 to 2.894 |
| NVIDIA GeForce RTX 3060 Laptop GPU | llama3.2:1b | Q8_0 | long | >= 2048 | 12 | 5.897 | 5.722 to 6.015 |
| NVIDIA GeForce RTX 3060 Laptop GPU | llama3.2:latest | Q4_K_M | short | 0 to < 256 | 12 | 3.207 | 2.908 to 4.416 |
| NVIDIA GeForce RTX 3060 Laptop GPU | llama3.2:latest | Q4_K_M | medium | 256 to < 2048 | 12 | 11.282 | 10.696 to 11.409 |
| NVIDIA GeForce RTX 3060 Laptop GPU | llama3.2:latest | Q4_K_M | long | >= 2048 | 12 | 15.261 | 15.04 to 15.651 |

Per-model per-band energy grows monotonically with prompt length (short <
medium < long on both models), which is the ramp story in section 2.3.2: a
short prefill finishes before the board reaches its power ceiling and a long
one spends most of its window there. THE SCOPE FENCE applies to every row
above exactly as it applies to Table 4: measured on this laptop, never applied
to hosted inference.

No device currently has an unresolved measured phase: both measured models'
prefill moved from Table 4's 2.2.0 unresolved list to Table 4b above, and
decode was already published in Table 4. A future device whose prefill fails
the curvature test AND lacks enough runs in a band to report would still be
recorded UNRESOLVED, not NOT-APPLICABLE, per `spec/test/measured-devices.test.mjs`.

---

## 5. Confidence Levels

| Level | Meaning | Typical path |
|-------|---------|-------------|
| `high` | Direct hardware power measurement (e.g. NVIDIA SMI, IPMI, PDU). | Power meter -> kWh |
| `med` | GPU-seconds x known TDP from Table 1. | `gpuSeconds + hardware` |
| `low` | Token proxy (Table 2), FLOP proxy, or hardware not in Table 1. | `tokens`, `flops`, or unknown hardware |

Fractional confidence (0 to 1) may be substituted for the string enum when a probabilistic derivation is available.

**`high` has exactly one route in this document (2.2.0).** It is a direct
hardware power measurement of the machine that ran the work: the Table 4 path in
section 2.3.1, or an equivalent instrument reading (IPMI, a PDU, an in-line
meter) taken on that same machine. Every other path here is a proxy and caps at
`med` or `low`. A producer never raises `confidence` above `low` because an
estimate looks plausible, and never carries `high` over from a measurement of a
DIFFERENT machine: applying a Table 4 row to hardware it does not name makes the
figure `low`, not `high`, because the number is then an assumption about
transferability rather than a measurement.

### 5.1 Provenance Ladder

`provenance` says where the FACTOR came from. `confidence` (section 5) says how
the ENERGY figure itself was arrived at. They are different ladders, a record
may carry both, and neither implies the other: a `measured` factor used with a
token proxy still gives a `low` confidence energy figure.

The ladder, strongest first:

| Rung | Meaning |
|------|---------|
| `measured` | The factor was benchmarked directly, on the hardware or the surface it describes. See 2.2.0's conditions below. |
| `vendor-published` | The provider published a figure. Cite it; note any split assumptions the figure folds together. |
| `class-estimated` | Inferred from the model class. No provider figure exists. |
| `synthetic` | The producer KNOWS it generated the input the factor was derived from: a representative grid, a constant table, a seeded generator. The number is real and reproducible; what it describes was generated rather than observed. |
| `unknown` | The source cannot be characterised at all. |

`synthetic` and `unknown` are not the same claim and must not be collapsed. A
producer that generated its own input knows exactly where the number came from,
which is more than `unknown` says. Recording that as `unknown` understates a
generated input and loses the one fact a reader most needs: that nothing was
observed, deliberately, and the producer can say what it made instead. This rung
was ruled in by the owner on 2026-09-11.

**What `measured` requires (2.2.0).** The rung is not a self-assessment. A
factor may claim `measured` only when all six hold, and Table 4's entries are
gated against them by `spec/test/measured-devices.test.mjs`:

1. The instrument, its reading, and its stated accuracy are named.
2. The MEASUREMENT SCOPE says what the instrument does and does not include.
3. An idle baseline was measured and subtracted, and both are published.
4. The figure is FITTED over at least 30 runs spanning at least three token
   counts, and every term is published with a 95 percent interval by a stated
   method. A single number with no interval is not a measurement result; it is
   one observation.
5. The fit is CHECKED and the check is published: `r2`, the residual standard
   error, and a curvature test. A significant quadratic term means the affine
   model is mis-specified and the entry is NOT published.
6. The raw samples and the method are published, in enough detail that a third
   party can repeat the measurement rather than trust the number.

A factor that fails any of these is at best `class-estimated`, whatever
instrument was pointed at it.

`confidence` in a disclosure is the producer's OVERALL confidence in the energy
figure, not a per-coefficient grade. It defaults to `low` for any token-proxy
method, which is every response-surface path in section 2.4. A producer raises
it above `low` only with a measurement it can point at, never because an
estimate looks plausible.

**Schema constraint (2.1.0).** The published schema
(`spec/aieds.schema.json`, unchanged in this version) enumerates `provenance`
as `measured`, `vendor-published`, `class-estimated`, `unknown`, and the enum is
closed. A machine-validated record therefore CANNOT carry `synthetic` until a
schema revision adds it. (2.2.0 note: methodology 2.2.0 did NOT make that
revision. The schema is versioned separately, by its own `$id`, and the wording
above dates from 2.1.0, when the next methodology version and the next schema
version were expected to be one change. They were not. The schema addition is
still outstanding and still goes through section 6 governance.) Until then a producer with a generated input
stamps the nearest rung the schema does carry and says in prose that the input
was generated. The rung is normative in this methodology; the schema catches up
in its own version, by the section 6 governance route.

#### Legacy terms (2.0.0)

2.0.0 named a different four-rung ladder in this section. Those terms are
retired. Read old records with this mapping:

| 2.0.0 term | 2.1.0 rung |
|------------|-----------|
| `estimated` | `class-estimated` |
| `modeled` | `class-estimated` |
| `provider-derived` | `vendor-published` |
| `verified` | `measured` |

The mapping is for READING 2.0.0 records. New disclosures use the 2.1.0 rungs.
A 2.0.0 record stays valid and does not need rewriting: it was correct under the
version it stamps.

---

## 6. Governance

Factor tables and methodology changes are **owner-ratified** (mirrors ADR 0008 / CODEX versioning policy):

1. A methodology change (factor value, new hardware, new region, path change) **must** bump the methodology version in this file and in `mcp/src/factors.ts`.
2. All three must stay in sync: `methodology.md` version, `METHODOLOGY_VERSION` in `factors.ts`, and the version recorded in every disclosure's `methodologyVersion` field.
3. No silent drift: the CHANGELOG at the top of this file is append-only. Old versions remain in git history for auditability.
4. The schema (`aieds.schema.json`) is MIT-licensed; methodology content (`methodology.md`) is CC BY 4.0. Forks may adapt the methodology but must attribute and use a distinct version prefix.

---

## 7. Interoperability

AiEDs disclosures are designed to interoperate with:

- **Hugging Face `co2_eq_emissions`** - the `gCO2e` field maps directly to HF's `co2_eq_emissions` (unit: grams). `source` maps to `training_type`/`framework`. `scope` maps to HF's `training_type` field where applicable.
- **EU AI Act model documentation** - the `energyKWh` and `gCO2e` fields satisfy the Act's Art. 13(3)(b)(iv) energy-consumption disclosure requirement. `confidence` and `methodologyVersion` support the transparency and accuracy obligations.
- **ISO 14064-1 / GHG Protocol** - `scope` maps to Scope 2 (grid electricity) for inference and device disclosures. Training may include Scope 1 where on-site generation is used.

---

## 8. Out of Scope (v1)

Deferred to v1.1+:

- Read API / SDK for ingesting disclosures from external producers.
- `.well-known/aieds.json` auto-discovery endpoint.
- Scope 3 embodied carbon (hardware manufacture).
- Real-time grid intensity (live carbon-aware scheduling).

# E+ Methodology

> **CURRENT VERSION: 1.2.0, RATIFIED 2026-09-22.** This is the first ratified
> text of the E+ (Earth Health Score) methodology. The owner ratified it on
> 2026-09-22 with the instruction "i approve the scoring-rule changes. if we're
> going to do all this work on Earth+ to make it an official standard let's do
> it right now." Versions 1.0.0 and 1.1.0 were drafts and were never ratified;
> implement 1.2.0. It states the normative requirements a v1 document and a v1
> implementation must meet. Nothing in it is new science. Every constant,
> weight, threshold and number was taken from a ratified ADR, from the producer
> source, from the four independent audits of 2026-09-10, from a named
> published dataset, or from a recorded owner decision, and each one says where
> it came from. Where something is undecided this text says so in an open
> question rather than filling the gap with a value. Where a value is a Random
> Knights parameter with no framework source, this text says that too.
>
> A rule in this text can be ahead of the reference implementation. Where it
> is, the implementation publishes what it computes, declares it honestly, and
> is read against this text by the conformance checker (section 7); the text is
> not bent to match the code.

> **License:** CC BY 4.0 rand0m.ai - [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

**Version:** 1.2.0 (E+ standard semver - distinct from the implementation's `methodologyVersion`, see section 9)
**Status:** Ratified
**Effective:** 2026-09-22
**Author:** Random Knights, LLC, ORCID https://orcid.org/0009-0006-5066-1693

## CHANGELOG

| Version | Date       | Changes |
|---------|------------|---------|
| 1.2.0   | 2026-09-22 | **RATIFIED. The document leaves Draft.** The owner ratified every Proposed rule on 2026-09-22 (RK-136, RK-125; ADR 0018 amendment Accepted; xyz-docs ADR 0019 "E+ 1.2.0 data program"). Seven rules become normative: **R1** assessed mode for the breach panel (6.1; `mode` on every entry, `liveBreachCount` and `assessedBreachCount` never summed). **R2** a live control value is evaluated on the basis its threshold is stated on; the aerosol entry is the trailing 12-month mean, never one month (6.2). **R3** fire is scored by the trailing self-sourced percentile and its input is on; with fewer than 30 baseline days it publishes no weight-carrying sub-score, and a new visible-but-no-weight representation (`warmUpDomains`, `warmUpReadings`) is defined (3.6, 4.2). **R4** land cover is forest remaining as a share of POTENTIAL forest (RESOLVE Ecoregions 2017, forest biomes 1 to 6), canopy threshold 15 percent, high-risk floor 54 (was 30), decision D8 lifted (2, 3.3). **R5** cryosphere = 0.5 sea ice + 0.5 glaciers with F 0.40 and the +-100 mm w.e. band (3.7, replacing the reference-table input). **R6** a synthetic input never feeds the score; biodiversity and conservation are absent until a commercially usable source exists (3.8, 5.2, 7.1). **R7** freshness by source cadence: a domain's window is its publication interval plus its stated lag, 48 h for daily sources (5.3). Section 10: OQ-2, OQ-3 and OQ-8 move to Decided, the fire cross-processing calibration moves to Dated, OQ-12 (biodiversity and conservation sources) is added, and OQ-11 stays open as the list of Random Knights parameters. Conformance checker: new check 10 (R3 warm-up), check 7 applies per-domain windows (R7), new check 11 (R6), check 9 gains the mode rules (R1). NUMBERS: the reference implementation still publishes under the 1.1.0 draft rules until its code lane flips the input flags; the would-be moves are stated in the implementation changelog below and in ADR 0019, and each flip gets its own changelog line with the old and new headline. The two Proposed rows below are the proposals this version ratifies; they are kept as written. |
| Proposed | 2026-09-21 | **PROPOSED, PENDING OWNER RATIFICATION; NO VERSION BUMP UNTIL RATIFIED.** Section 3.7 gains 3.7.1, the cryosphere domain from published observations (RK-136): cryosphere = 0.5 sea ice + 0.5 glaciers. Sea ice is the NSIDC Sea Ice Index daily extent per hemisphere against the day-of-year 1981 to 2010 median, health = clamp(100 x (1 - max(0, (median - extent) / median) / F), 0, 100) with F = 0.40, averaged over the Arctic and the Antarctic. Glaciers keep improving 80 / stable 60 / worsening 25, the category taken from the latest 10-year mean of the WGMS reference-glacier balance against the prior 10-year mean with a +-100 mm w.e. band. The glacier half is exempt from the 48 h freshness window and is stale 18 months after its newest hydrological year ends; a missing or stale half leaves the other half alone, and the reading says so; never a synthetic input. F and the band are Random Knights parameters with no framework citation, added as OQ-11. The reference implementation builds this behind an input pin that stays off until ratification. |
| Proposed | 2026-09-21 | **PROPOSED, PENDING OWNER RATIFICATION; NO VERSION BUMP UNTIL RATIFIED.** Section 6 gains 6.2, the averaging window for a live control value: the atmospheric-aerosol-loading entry evaluates the mean of the trailing 12 monthly interhemispheric AOD differences, published only when all 12 months are present, never one month (RK-135, RK-136). The version stays 1.1.0 until the owner ratifies, so no consumer README fans out for a rule that is still a proposal. |
| 1.1.0   | 2026-09-18 | **PENDING ADR 0018 AMENDMENT RATIFICATION.** Section 6 gains 6.1, a second breach-panel evaluation mode: `live` (the existing feed-driven mode) and `assessed` (a value taken from the pinned published edition, cited with edition and year, never presented as live), under an amendment to ADR 0018 that is Proposed, not yet Accepted. Adds the conformance rule the reference implementation's tests follow once the amendment is Accepted: every entry carries `mode` in `{live, assessed, unknown}`; an assessed entry carries a non-empty edition, year and citation; the breach count publishes as `liveBreachCount` and `assessedBreachCount`, two fields, never summed. No published number moves and no existing rule (1 through 5) changes; this is a minor version because the schema of the published panel gains new fields. |
| 1.0.0   | 2026-09-13 | **DRAFT. First assembled text.** Nine domains and weights as frozen by ADR 0008 and amended by ADR 0012; every normalizer including the v0.7 protected-area saturation and humility ceiling; the coverage-normalized region mean and the v0.8 exposure-weighted headline; the five-rung provenance ladder with the rule that a document MUST NOT declare live for a synthetic or carried-forward input; the non-averageable breach panel under owner decision D2; conformance requirements for documents and implementations; governance. Owner decisions D4 to D7 (2026-09-13) applied in the same draft: `meta.eplusVersion` is a conformance requirement (D4); the `air`, `ocean` and `biodiversity` basis relabel to `contextual-proxy` is decided and waits on its ADR (D5); the conformance checker is published from this repository as its single canonical home at `eplus/v1/conformance/`, runnable by a third party with no producer checkout, and the reference implementation consumes it pinned to a commit rather than keeping a copy (D6); the `global` pseudo-region defect is dated with a resolution plan (D7). The six remaining open questions are listed in section 10 and none of them is answered here. |

## Implementation changelog (public)

This is the public changelog that ADR 0012's rollout step 4 requires and that
its sign-off box 5 was open on. It records every change to the published
Earth Health Score that moved a public number or changed how a public number is
derived, with the OLD number, the NEW number, and why it moved. The rule this
section enforces: **a reader must always be able to tell a change in the
METHOD from a change in the WORLD.** They are not the same event and they must
never look alike.

### Pending under standard 1.2.0 (no published number has moved yet)

Standard 1.2.0 changes how four domains are derived (fire, land cover,
cryosphere, and the removal of the synthetic biodiversity and conservation
inputs). None of those changes is published yet: the reference implementation
builds each one behind an input flag that stays off until its code lane flips
it, and each flip gets its OWN entry here, with the old headline, the new
headline, and the words "a change in the method". The evidence already in hand,
stated so nobody reads the coming moves as planetary events:

- Removing the synthetic biodiversity and conservation inputs, nothing added:
  headline 63.2 to 59.3 on the staging document of 2026-09-22T01:57Z (the
  recompute reproduced the published 63.2 exactly). Oceania rises from 79.6 to
  92.2 in the same step, the section 4.2 effect of a missing domain.
- Fire, would-be on the last seed day (2025-12-31, 216 baseline days):
  north-america 8.8, south-america 82.9, europe 2.3, africa 78.7, middle-east
  24.5, asia 63.0, oceania 93.3, arctic 43.8, antarctic 50.9, global 85.6.
- Land cover, would-be on a 2019 prototype of the potential-forest quantity:
  global forest remaining 68.1 percent; with the 54 floor, global forest
  health moves from 84.7 (30 floor) to 67.2 and Europe from 49.3 to 0.
- Cryosphere, would-be on 2026-09-20 data: 41.8 (worked in section 3.7).

### Implementation 0.8 (2026-09-12): the headline is derivable from the published document

**THE HEADLINE CHANGED FROM 63.4 TO 58.95. THIS IS A CORRECTION TO
DERIVABILITY, NOT A CHANGE IN PLANETARY CONDITIONS.** Nothing about the Earth
got worse between 0.7 and 0.8. No weight, no threshold, no normalizer, no domain
and no input changed. What changed is which set of regions the published
headline is computed from, and it changed so that the number can be checked by
anyone holding the file.

| Document | Old headline (0.7) | New headline (0.8) | Old confidence | New confidence |
|---|---|---|---|---|
| 2026-09-10T23:28:13.949Z, the document all four audits read | 63.4 | 59.0 (exact rollup 58.9504741) | 0.80 | 0.77 |
| 2026-09-11T23:28:15.692Z, live when the change was written | 63.8 | 59.2 (exact rollup 59.2003647) | 0.80 | 0.77 |

58.95 is the unrounded rollup two auditors computed independently from the
published regions (consensus finding C2). The document publishes the headline at
one decimal. No regional score changed. No domain score changed.

What was wrong: the producer published `regions` from a masked region set and
computed `global` from a second, unmasked set (the 0.5 "global ring", the same
regions rebuilt with the inland ocean mask removed) that the document never
carried. Europe's real contribution to the old headline was 47.6 while the
document published Europe as 37.4. What 0.8 does: the headline is the
exposure-weighted rollup of the ten published regions (owner decision D1); the
old ring is retained as `meta.globalRingDiagnostic` with a note that it is NOT
the headline; `meta.derivation` publishes the worked arithmetic; every region
publishes `notApplicableDomains`. All fields are additive.

### Implementation 0.7 (default flipped 2026-07-08, ratified as amended 2026-09-12)

Protected-area coverage rescored by exponential saturation with scale 25, and a
humility ceiling (knee 90, ceiling 97, tau 7) applied to every normalized
signal. Owner-ratified constants; composite delta on the ratification diff was
-3.7 to +0.1 points by region. ADR 0012 records that the flip preceded its own
ratification and that box 4 of its sign-off is NOT VERIFIABLE for that reason.

### Earlier implementation versions

- **0.6** - the `human` domain (Anthroposphere pressure) at 0.10, ratified
  2026-06-25 (ADR 0008); gridded land domains moved from a centroid cell to a
  per-region area mean. Score math frozen at 0.6.
- **0.5** - ocean warming and ocean acidification marked not-applicable for a
  region whose centroid is more than 1500 km from open ocean, global ring
  exempt. That exemption is what 0.8 retired as a headline rule.
- **0.4** - the planetary-boundaries regrounding; the 0.3 ocean weight split
  0.10 warming / 0.10 acidification.

---

## 1. Scope and Non-Overlap

E+ is a **planetary health index**: a 0 to 100 score for the Earth and for ten
regions, refreshed on a schedule, built from nine environmental domains. It is
NOT AiEDs. AiEDs measures the energy and carbon of one AI subject; E+ measures
the state of the biosphere. The two standards are independent and neither
number feeds the other.

| Dimension | E+ | AiEDs |
|-----------|----|-------|
| Object | Planetary health | One AI subject |
| Unit | 0 to 100 index | kWh / gCO2e |
| Scope | Global + ten regions | device / usage / inference / training |
| Update | Scheduled refresh (the reference implementation runs every 6 hours) | Per-session or batch |

An E+ document MAY carry an AiEDs figure for the device that rendered it (the
reference implementation publishes `global.aiedsFactor` with
`blendedIntoScore: false`). That figure MUST NOT be blended into any E+ score.

What E+ v1 claims, stated plainly: a scoring methodology with a published
conformance test, a provenance ladder that forbids claiming live for a
synthetic input, and a non-averageable breach panel with cited thresholds. It
does NOT claim that every domain is on live daily data. The conformance test is
what makes that claim checkable rather than a promise. "Every domain live" is a
v2 goal and does not gate v1.

---

## 2. The Nine Domains

Weights and directions are frozen by ADR 0008 (methodology 0.6, 2026-06-25)
and carried forward unchanged by ADR 0012 (0.7, ratified as amended
2026-09-12). Bases are as relabeled by ADR 0018 (Accepted 2026-09-16). A change
to any of them is a methodology version bump and requires an Accepted ADR
BEFORE the default changes (section 9). Standard 1.2.0 changes no weight and no
direction. It changes the control variable and anchors of `land-cover`, `fire`
and `cryosphere` (sections 3.3, 3.6, 3.7) and removes the synthetic inputs of
`biodiversity` and `conservation` (section 3.8); those domains keep their
declared weights and publish no sub-score, so their weight counts as missing
in `confidence`.

| Domain | Weight | Direction | Basis | Control variable | Units | Safe | High risk | Citation |
|---|---|---|---|---|---|---|---|---|
| `land-cover` | 0.25 | benefit | boundary | Forest remaining as a share of potential forest (land-system change) | % of potential forest remaining | >= 75 | <= 54 | Steffen et al. 2015; Richardson et al. 2023; Planetary Health Check 2025; Dinerstein et al. 2017 (RESOLVE Ecoregions) |
| `fire` | 0.20 | burden | contextual-proxy | Active-fire detections against the region's own same-season baseline | midrank percentile | calmest baseline day (p 0) | worst baseline day (p 1) | NASA FIRMS VIIRS NOAA-20 active fire (contextual signal) |
| `air` | 0.15 | burden | contextual-proxy | PM2.5, atmospheric aerosol loading | ug/m3 | <= 5 (WHO 2021 annual guideline) | >= 50 | WHO 2021 Global Air Quality Guidelines; Steffen et al. 2015 |
| `ocean` | 0.10 | burden | contextual-proxy | Sea-surface temperature anomaly (climate-change proxy) | deg C vs 1991-2020 | 0 | +2 warm (or -4 cold) | Hobday et al. 2016; IPCC AR6 |
| `ocean-acidification` | 0.10 | benefit | boundary | Surface-ocean aragonite saturation, Omega_arag | Omega | >= 2.75 | 1.0 | Richardson et al. 2023; Steffen et al. 2015; Planetary Health Check 2025 |
| `cryosphere` | 0.10 | burden | contextual-proxy | Sea-ice extent deficit (half) and glacier mass-balance trend (half) | health per half | extent at or above the 1981 to 2010 median; glaciers improving | deficit of 40 percent of the median; glaciers worsening | NSIDC Sea Ice Index G02135 v4; WGMS Fluctuations of Glaciers (contextual signal) |
| `biodiversity` | 0.10 | benefit | contextual-proxy | Species-richness index (biosphere-integrity proxy); ABSENT until a commercially usable source exists (3.8) | 0 to 100 index | 100 | 0 | Richardson et al. 2023 |
| `conservation` | 0.08 | benefit | contextual-proxy | Protected-area coverage vs the 30x30 target; ABSENT until a commercially usable source exists (3.8) | % area protected | >= 30 (GBF Target 3) | 0 | Kunming-Montreal GBF Target 3 |
| `human` | 0.10 | burden | contextual-proxy | Global Human Modification (Anthroposphere pressure) | gHM x 100 | <= 5 | >= 40 | Kennedy et al. 2019; Venter et al. 2016 |

**The weights sum to 1.18, not to 1.** They are never used as absolute shares.
Each region renormalizes over the weights actually present (section 4.2), and
1.18 appears only as the denominator of `confidence`. A conforming document
publishes the sum as `meta.derivation.rawWeightSum`.

**Basis is a label, not a badge.** `boundary` means the domain is scored as a
distance from a published planetary-boundary threshold. It does NOT mean the
domain's indicator is the accepted control variable of that boundary. The
four-auditor consensus (C7) found that three of the five `boundary` domains
carry an indicator that is not the accepted control variable: `air` (PM2.5 is
a public-health measure, the aerosol control variable is interhemispheric
aerosol optical depth), `ocean` (SST anomaly is a climate proxy, the control
variables are atmospheric CO2 and radiative forcing) and `biodiversity`
(richness is not extinction rate or HANPP). Only `land-cover` and
`ocean-acidification` use the accepted control variable. This is why the
breach panel (section 6) admits two domains and names the exclusions. The
three labels are `contextual-proxy` as of ADR 0018, Accepted 2026-09-16 (owner
decision D5, 2026-09-13), shipped in the same release as the breach panel
because both change what a client renders.

---

## 3. Normalizers

Every normalizer maps a domain reading to a health value in 0 to 100, higher is
healthier, rounded to one decimal. The producer then applies the humility
ceiling (section 3.9) at a single chokepoint before the value is published.
Formulas are stated as the reference implementation computes them.

### 3.1 Boundary distance (generic)

```
benefit:  f = (value - highRisk) / (safe - highRisk)
burden:   f = (highRisk - value) / (highRisk - safe)
health    = round1( clamp(f x 100, 0, 100) )
```

Returns no value (the domain is absent, not zero) when the reading is missing,
non-finite, or the safe and high-risk anchors are degenerate. Used by
`land-cover`, `air` (PM2.5), `ocean-acidification` and `human`.

### 3.2 Air

Two signals blended inside the domain: PM2.5 at 0.65 and NO2 column at 0.35.
PM2.5 is boundary distance with safe 5 ug/m3 and high risk 50 ug/m3. NO2 is
`100 - (no2 / 250) x 100` with 250 umol/m2 as full scale. A US AQI reading is a
fallback only: `100 - (usAqi / 200) x 100`.

### 3.3 Land cover

Two signals: forest at 0.75 and tree-cover vitality at 0.25. The tree-vitality
input is pinned to absent in the reference implementation, so forest carries
the domain.

**The quantity (R4, ratified 2026-09-22).** Forest is the land-system-change
control variable: forest area remaining as a percent of POTENTIAL forest area,
computed over the cells where potential forest exists, so deserts, tundra and
ice sheets drop out of both the numerator and the denominator.

- **Denominator.** Potential forest is the extent of forest biomes 1 to 6 of
  RESOLVE Ecoregions 2017 (Dinerstein et al. 2017, BioScience 67(6):534-545,
  doi:10.1093/biosci/bix014, CC BY 4.0). The reference implementation vendors
  it as a 0.5 degree grid pinned by sha256: 55.8 million km2 of potential
  forest. Hengl et al. 2018 gives the same global result and was used as a
  cross-check only.
- **Numerator.** A cell counts as forest where tree canopy cover is 15 percent
  or more, applied per pixel BEFORE aggregation to the cell. 15 percent is the
  forest threshold of the land-cover classification behind the maps the
  framework's own assessments use (Richardson et al. 2023; Planetary Health
  Check 2025). The reference source is MODIS MOD44B v061 percent tree cover
  (doi:10.5067/MODIS/MOD44B.061), newest complete year. Only a declared
  forest-area band is accepted as the numerator; a canopy-percent grid is not
  forest area and does not stand in for it.
- **Normalizer.** Boundary distance (3.1) on forest remaining with safe 75 and
  high risk **54**, the framework's own high-risk line (Planetary Health Check
  2025), so the score's normalizer and the breach panel's land-system entry
  read against the same two lines. The 1.1.0 floor of 30 had no framework
  source and is retired.
- **Decision D8 is lifted.** The owner pin that kept the tree-canopy grid out
  of the score because canopy percent is not forest remaining is answered by
  this quantity. The domain is `vendor-published` once the numerator band is
  published; until then it is absent, never read from a constant table (R6,
  section 3.8).

Would-be reading, on a 2019 prototype of the numerator: global 68.1 percent of
potential forest remaining (66.1 with exact cell overlap), south-america 75.2,
africa 77.7, north-america 67.5, asia 64.3, oceania 61.9, arctic 69.1, europe
52.2, middle-east 14.4. The Planetary Health Check 2025 reports 59 percent
globally; the gap is method (a different land-cover source and year), not a
disagreement about the forest.

### 3.4 Ocean warming

Asymmetric anomaly: `health = 100 - (|anomaly| / scale) x 100` where scale is
2 deg C for a warm anomaly and 4 deg C for a cold one. Warm anomalies (marine
heatwave and bleaching risk) are penalized harder.

### 3.5 Ocean acidification

Boundary distance on surface aragonite saturation with safe Omega 2.75 and high
risk Omega 1.0. Under 0.7 and later the humility ceiling applies, so the
published health at the audited Omega 2.7 was 94.5: `boundaryHealth = 1.7 /
1.75 x 100 = 97.14`, then `softCeil(97.14) = 94.48`. That value is arithmetically
correct and it is the reason the breach panel exists: 2.7 is below the domain's
own 2.75 safe line, so the boundary is transgressed while the health reads
near-pristine (consensus C5). The panel, not the normalizer, is where
transgression is stated.

### 3.6 Fire

**The normalizer (R3, ratified 2026-09-22).** Fire is scored by a **trailing
self-sourced percentile** (owner selection: design S, 2026-09-12; built as
lane B2), and the fire input is ON: the owner pin B1
(`FIRE_SCORE_INPUT_ENABLED = false`) is lifted by this ratification. The
1.1.0 formula `100 - (detections / 50) x 100` is retired: 50 detections as
full scale read any continental box as burning at zero.

For region `r`, the day scored is `d`, the latest WHOLE UTC day (a partial
current day undercounts by an order of magnitude and MUST NOT be scored). With
`c` the detection count in the region's box on `d` and `H` the baseline
counts:

```
below = count of h in H with h <  c
equal = count of h in H with h == c
N     = count of H
p     = (below + 0.5 x equal) / N        midrank empirical percentile, 0..1
fire  = round1( 100 x (1 - p) )          then the humility ceiling
```

No fitted parameter, no cited constant. An all-zero baseline with today at zero
gives p 0.5 and health 50.0: a never-burning region sits at its own median, not
at pristine. The long-run mean of p is 0.5, so the long-run mean fire health is
50.0.

- **Baseline.** Same-season: the days within plus or minus 15 of `d`'s day of
  year across the baseline years, plus the 15 whole days before `d` (`d` itself
  excluded). The baseline years are VIIRS NOAA-20 standard processing, calendar
  years 2019 to 2025 inclusive (seven complete years; partial years are
  excluded so uneven per-day-of-year counts cannot read as a seasonal anomaly),
  computed once, versioned, and never recomputed rolling. The live reading is
  VIIRS NOAA-20 near real time. Where a date is in both, the live whole day
  wins, and the two are never mixed within one day.
- **Cross-processing gap.** The two processing levels abut on 2026-05-31 /
  2026-06-01 with no shared day, so the gap between them cannot be quantified
  yet and MUST NOT be described as small. It is dated in section 10.
- **Missing versus zero.** A successful fetch with no rows records 0; a failed
  fetch records nothing, and nothing is never read as 0.
- **Published with the sub-score.** Every fire sub-score carries its
  `baseline` block: at least the method, `n` (N), `minDays` (30), `warmUp`, the
  percentile, and the baseline and live source ids, so a reader can see what
  the reading was ranked against.

**Warm-up.** With N under 30 the percentile is coarser than 3.3 health points
per rank step and does not yet measure seasonal position, so the region
publishes NO weight-carrying fire sub-score. Two outputs conform:

1. **Nothing** (what the reference implementation publishes today). The domain
   is absent from that region, and its weight counts as missing in
   `confidence`, exactly like any other absent domain.
2. **Visible, carries no weight.** The region lists `fire` in
   `warmUpDomains` and publishes the reading in `warmUpReadings`, NOT in
   `subScores`: the raw count as `controlValue`, the `baseline` block with
   `warmUp: true` and `n` under 30, and `provenance: "synthetic"`,
   `synthetic: true`, because the baseline the reading needs does not exist
   yet. It enters no score, no global chip and no rollup, and its weight is
   removed from that region's confidence denominator (section 4.2), so a
   baseline still building neither moves the score nor silently depresses
   confidence. A surface can show "247 detections, baseline still building
   (12 of 30 days)".

A fire sub-score in `subScores` whose `baseline` block shows `n` under 30 or
`warmUp: true` does not conform (check 10, section 7.3).

Stated limitation, which a conforming document carries in `meta.domainScience`:
this is NOT absolute fire burden. A region that burns catastrophically every
day reads 50.

Would-be reading on the last seed day (2025-12-31, N 216): north-america 8.8,
south-america 82.9, europe 2.3, africa 78.7, middle-east 24.5, asia 63.0,
oceania 93.3, arctic 43.8, antarctic 50.9, global 85.6.

### 3.7 Cryosphere

Through 1.1.0 the domain was one categorical glacier reading (improving 80,
stable 60, worsening 25, unknown absent) taken from a reference input
regenerated from ten compile-time anchors, so its mean was a fixed 78.0 and the
trend arrow could never read anything but one value. That input is synthetic
and, under R6 (section 3.8), it no longer feeds the score. Section 3.7.1
replaces it.

### 3.7.1 Cryosphere from published observations (R5, ratified 2026-09-22)

Ratified by the owner on 2026-09-22 (RK-136). It replaces the reference input
of 3.7 with two published series and keeps the categorical glacier scores; it
does not change the domain's weight (0.10), direction (burden), basis
(contextual-proxy) or applicability mask (4.1).

The domain health is

```
cryosphere = 0.5 x seaIce + 0.5 x glaciers
```

- **Sea ice.** For each hemisphere, the newest daily extent of the NSIDC Sea
  Ice Index (G02135, Version 4) is compared with the median (50th percentile)
  of the NSIDC 1981 to 2010 climatology for the same calendar day of year:

  ```
  deficit = max(0, (median - extent) / median)
  health  = clamp(100 x (1 - deficit / F), 0, 100),   F = 0.40
  ```

  An extent at or above the median reads 100; a deficit of 40 percent of the
  median reads 0. `seaIce` is the mean of the Arctic and the Antarctic health.
  F is a Random Knights parameter with no framework citation (OQ-11).
- **Glaciers.** The categories of 3.7 are kept (improving 80, stable 60,
  worsening 25). The category comes from the WGMS reference-glacier annual
  mass balance (regional average, mm w.e.): the mean of the latest 10
  hydrological years against the mean of the 10 before. More negative by more
  than 100 mm w.e. is worsening, less negative by more than 100 mm w.e. is
  improving, otherwise stable. Both windows must be complete; a missing year
  never shrinks a window. The band is a Random Knights parameter with no
  framework citation (OQ-11). This category also drives `trendBasis`
  `cryosphere` (4.5).
- **Freshness (section 5.3, R7).** The sea-ice half is a daily source and sits
  under the 48 h window. The glacier half is annual, so its window is its
  cadence plus its lag: it is stale when its newest hydrological year ended
  more than 18 months ago (12 months of cadence plus 6 months of publication
  lag). A document whose cryosphere reading rests on the glacier half alone
  measures the domain's freshness on that rule.
- **One half missing.** A half that is absent or stale is left out and the
  domain uses the other half alone; the reading names its basis
  (`sea-ice+glaciers`, `sea-ice only` or `glaciers only`). One hemisphere
  alone stands for the sea-ice half the same way. With neither half the domain
  is absent, never estimated. Section 4.5 gates the trend on the glacier half:
  with no fresh glacier half the trend is `unknown`.
- **Never synthetic.** No generated, representative or in-repo value enters
  either half. A source that declares itself generated reads as absent.
- **Sources.** Sea ice: the National Snow and Ice Data Center's Sea Ice
  Index, Version 4 (data set G02135), prepared by F. Fetterer, K. Knowles,
  W. N. Meier, M. Savoie, A. K. Windnagel and T. Stafford, 2025,
  https://doi.org/10.7265/a98x-0f50. NSIDC asks for a citation as a condition
  of use; it names no license and states no commercial-use restriction, which
  is a stated risk rather than a grant. Glaciers: the World Glacier Monitoring
  Service (Zurich) Fluctuations of Glaciers database, version of 2026-02-10,
  https://doi.org/10.5904/wgms-fog-2026-02-10, under CC BY 4.0.

Worked reading, on 2026-09-20 data: Arctic 4.709 million km2 against a median
of 6.412 (health 33.6), Antarctic 17.386 against 18.593 (83.8), sea-ice half
58.7; glaciers 2016-2025 mean -950.4 mm w.e. against 2006-2015 -665.2 (change
-285.2, worsening, 25); cryosphere 0.5 x 58.7 + 0.5 x 25 = 41.8.

### 3.8 Biodiversity, conservation, human

**R6, ratified 2026-09-22: a synthetic input never feeds the score.** No
generated, representative, seeded or in-repo constant value may be published
as a weight-carrying sub-score, in any domain. A domain whose only input is
synthetic publishes NO sub-score: it is absent, its declared weight stays in
`meta.weights`, and that weight counts as missing in `confidence` (section
4.2). The input may still be declared in `meta.domainProvenance` as
`synthetic`, so a reader can see what exists and why it is not scored. Removing
a domain can raise a region's score (section 4.2); that is the stated cost of
not scoring invented numbers, and `confidence` says so.

Under this rule `biodiversity` and `conservation` are ABSENT, with no reading,
until a commercially usable source exists for each. Their reference inputs
were synthetic stand-ins. The sources examined are not usable today: the
candidate biodiversity indices measure something other than the section 2
control variable or are licensed for non-commercial use only, and the
protected-area statistics (Protected Planet, UNEP-WCMC and IUCN) are published
under terms that require written permission for commercial use. A permission
request is pending with UNEP-WCMC for Protected Planet and with PIK for the
Planetary Health Check biosphere-integrity figures (OQ-12). The normalizers
below are the ones a
domain uses the day it has a usable source; they are not in use today.

- `biodiversity`: `(richness / 100) x 100`, read directly as health. A richness
  proxy, not a Biodiversity Intactness Index.
- `conservation`: under 0.6, `(coverage / 30) x 100`. **Under 0.7 and later:
  `100 x (1 - exp(-coverage / 25))`**, `PROTECTED_SATURATION_SCALE = 25`, so
  30 percent coverage reads about 70, 50 percent about 87 and 75 percent about
  95. The GBF 30x30 target is a floor near 70, not a cap at 100 (ADR 0012).
- `human`: boundary distance on the region area mean of the gHM grid x 100,
  safe 5, high risk 40. Ocean and ice cells excluded.

### 3.9 The humility ceiling (0.7 and later)

Applied to every normalized value, at one chokepoint, so no domain and no
composite ever reads a perfect 100:

```
KNEE = 90, CEIL = 97, TAU = 7
h <= KNEE:  unchanged
h >  KNEE:  round1( CEIL - (CEIL - KNEE) x exp(-(h - KNEE) / TAU) )
```

The slope at the knee is (CEIL - KNEE) / TAU = 1.0, so the ceiling never raises
a value. At TAU 5 the slope was 1.4 and values between 90 and 93.5 were nudged
up; TAU was raised to 7 during candidate review for that reason (ADR 0012,
sign-off box 3). 100 maps to about 95.

---

## 4. Aggregation

### 4.1 Regions and applicability

Ten regions with published bounding boxes: `global` (the whole planet, a
pseudo-region), `north-america`, `south-america`, `europe`, `africa`,
`middle-east`, `asia`, `oceania`, `arctic`, `antarctic`. Ocean warming and ocean
acidification are not applicable to a region whose centroid is more than 1500
km from open ocean; cryosphere is not applicable beyond 1500 km from glaciated
terrain; `global` is exempt from both masks. A conforming document publishes
each region's mask as `notApplicableDomains` (sorted), because without it a
reader cannot tell a not-applicable domain from a missing one and `confidence`
is not derivable.

### 4.2 Region score: the coverage-normalized mean

```
score              = round1( sum(normalized_i x weight_i) / sum(weight_i) )   over PUBLISHED sub-scores
totalWeight        = 1.18 - sum(weight of notApplicableDomains) - sum(weight of warmUpDomains)
confidence         = round2( sum(weight of published sub-scores) / totalWeight )
measuredCoverage   = round2( sum(weight of published sub-scores with synthetic == false) / totalWeight )
```

`warmUpDomains` (sorted, per region) lists the domains published visible but
not weight-carrying under a warm-up rule (today only `fire`, section 3.6). A
region that publishes no warm-up reading omits the list or publishes it empty,
and then the formula is the 1.1.0 one. A domain is never in both
`notApplicableDomains` and `warmUpDomains`.

This is a compensatory mean. It has no breach term: all five boundary domains
fully breached still yields 27.7, and fire at zero with everything else perfect
reads 83 (consensus C6). That is defensible ONLY because the breach panel
(section 6) is published alongside and is not averageable. A document that
publishes the score without the panel does not conform (section 7).

**Missing data can RAISE the score.** Because the mean is taken over the
domains present, dropping a domain whose health is below the mean raises the
number. On the 2026-09-11 document, removing `human` moved the published-region
rollup from 59.2 to 61.2 while confidence fell from 0.77 to 0.68 (consensus
finding S4; the earlier claim that missing data "lowers confidence rather than
the score" was false and has been retracted from the disclosure). Read
`confidence` and `measuredCoverage` before reading the score.

### 4.3 Headline: the exposure-weighted rollup (0.8 and later)

```
global.score            = round1( sum(region.score x region.exposure) / sum(region.exposure) )
global.confidence       = round2( the same exposure-weighted mean of region.confidence )
global.measuredCoverage = round2( the same, of region.measuredCoverage )
```

over the regions the document publishes that carry at least one sub-score.
`exposure` is the region's area mean of a population-density grid normalized to
0 to 100 (fallback 1). The `global` pseudo-region is a member of its own rollup;
0.8 states this in `meta.derivation.exposureNote` rather than changing it,
because changing it would move the number for a second, unrelated reason in the
same release. This is a dated defect with a resolution plan, not an open
question: see section 10, OQ-7.

Per-domain global chips are `round1( sum(normalized x exposure) / sum(exposure) )`
per domain; the rolled-up provenance is the WEAKEST rung among contributors and
the rolled-up `synthetic` is the OR. A known false trail, published in
`meta.derivation.steps`: weight-averaging the global chips gives 62.04 on the
2026-09-10 document, not the headline, because each region carries its own
coverage denominator.

### 4.4 The global-ring diagnostic

The unmasked 0.5 ring (every region rebuilt with the ocean mask removed) is
retained as `meta.globalRingDiagnostic` with its score, confidence, trend and
per-region scores and a note that it is NOT the headline and is NOT
reproducible from the document. It exists so the 0.7 to 0.8 step in the history
is explicable rather than looking like a planetary event.

### 4.5 Trend

`trendBasis` is `cryosphere`. The direction is the glacier category of section
3.7.1 (improving, stable, worsening). It is published only when the glacier
half is non-synthetic AND fresh under its own annual window (section 5.3);
otherwise the trend is `unknown` and `meta.trendGate` says why. The sea-ice
half never sets the trend: a daily extent against a day-of-year median is a
level, not a direction.

### 4.6 The no-data guard

A refresh that yields no region with at least one sub-score, or no region with
at least one non-synthetic sub-score, publishes nothing new. The prior document
is re-stamped stale (section 5.4) rather than replaced by a document built
entirely from generated inputs.

---

## 5. Provenance and Liveness

### 5.1 The ladder

E+ uses the AiEDs 2.1.0 provenance ladder, strongest first, with the same
meaning per rung:

| Rung | Meaning |
|------|---------|
| `measured` | Observed directly on the thing described. Not reachable from the reference pipeline today. |
| `vendor-published` | A third-party dataset the producer names and dates. |
| `class-estimated` | Inferred from a class; no dataset figure exists. |
| `synthetic` | The producer KNOWS it generated the input: a representative grid, a constant table, a seeded generator. |
| `unknown` | The source cannot be characterized at all. |

`synthetic` and `unknown` are not the same claim and MUST NOT be collapsed.
"Unknown" is ignorance; "synthetic" is knowledge. Recording a generated input
as `unknown` understates it (owner ruling 2026-09-11, carried from AiEDs).

### 5.2 Per-domain declaration (normative)

A conforming document declares provenance PER DOMAIN, machine readable, under
`meta.domainProvenance`, with at least: `provenance` (a rung), `synthetic`
(boolean), `available`, `sourceLabel`, `sourceKind`, `sourceLicense`,
`vintage`, `asOf`, `ageHours`, `fresh`. Every sub-score in `global` and in each
region repeats `provenance` and `synthetic` so a reader of one number is not
guessing. A source that self-declares as generated (kind, license or vintage
reading `representative`) is `synthetic`. A source that is an in-repo constant
is `synthetic` with `fresh: false`. A source with no object or no metadata is
`unknown`. Under R6 (section 3.8) a `synthetic` domain is declared here and
scored nowhere.

A domain whose source is not daily also publishes, in its
`meta.domainProvenance` entry, `cadenceHours` (its publication interval),
`lagHours` (its stated publication lag) and `freshnessWindowHours` (their sum),
per section 5.3.

### 5.3 Liveness is computed, never asserted

```
window(domain) = domainProvenance[domain].freshnessWindowHours   when published
               = meta.freshnessWindowHours                       otherwise
fresh(domain)  = not synthetic AND ageHours <= window(domain) AND ageHours >= -1
live(domain)   = not synthetic AND available AND rung in {measured, vendor-published} AND fresh
meta.isLive    = every weight-carrying domain is live
```

**Freshness by source cadence (R7, ratified 2026-09-22).** A source is fresh
within its own publication interval plus its stated lag, and not within one
window shared by every source. Through 1.1.0 a single 48 h window applied to
every domain, so a monthly or annual source that was as current as its
publisher allows read as stale every day of its life, and `isLive` could never
be true for a document that used one.

- `meta.freshnessWindowHours` stays the window for DAILY sources and stays 48
  in the reference implementation (a 24 h cadence plus a 24 h lag). It is a
  disclosed policy constant and is published in the document.
- A source with a longer cadence publishes its own window in its
  `meta.domainProvenance` entry: `freshnessWindowHours = cadenceHours +
  lagHours`. The cadence is the LONGEST interval of the publisher's calendar,
  so a source is never stale inside its own normal interval: a monthly source
  uses 744 h (31 days) and an annual source 8784 h (366 days). The lag is the
  publisher's own stated or observed delay between the end of a period and
  its release, disclosed as a number.
- For a period product (a monthly or annual value) `ageHours` is measured
  from the END of the period its newest value covers, not from the fetch time
  and not from the start of the period.
- Worked windows: the glacier half of cryosphere is annual (8784 h) with a
  6-month lag (4392 h), a window of 13176 h, so it is fresh for about 18
  months after its newest hydrological year ends (section 3.7.1); the
  ocean-acidification field is monthly (744 h) with a stated lag of about 10
  days (240 h), a window of 984 h.
- A window MUST NOT be widened past cadence plus lag to make a late source
  read fresh. A source past its own window is stale, and `isLive` is false.

The document also publishes `weightCarryingDomains`, `notLiveDomains`,
`staleDomains`, `oldestSourceVintage` with its domain, and
`vintagelessDomains`.

**A document MUST NOT declare `isLive: true` when any weight-carrying domain is
`synthetic`, carried forward past its freshness window, or of rung
`class-estimated` or `unknown`.** This is the rule consensus C4 found violated:
about 64 percent of delivered weight was generated while `isLive: true` was
asserted unconditionally. Under this rule an implementation on partial live
data is conformant and honest; it is `isLive: false` with the reasons listed,
not non-conformant.

### 5.4 Staleness

A failed refresh leaves `score`, `regions` and `generatedAt` untouched (they
are the true vintage) and rewrites only the honesty block: `isLive: false`,
`stale: true`, `staleSince` (first failure, idempotent), `staleReason`,
`staleForHours`, `documentAgeHours`, `lastRefreshAttemptAt`. A stale document
never claims currency.

### 5.5 Mixed cadence

Domains run at their real cadence with honest per-domain labels (owner
decision, option A). Glaciers, biodiversity and human modification have no
daily product anywhere; they are declared at their true cadence and provenance,
their freshness is measured on their own window (section 5.3, R7), and the
document stays conformant. If the bulk of inputs turn out to be
monthly, scoring moves to monthly. v1 does not wait for daily sources that do
not exist.

---

## 6. The Breach Panel

Owner decision D2 (2026-09-12): the headline stays a compensatory mean, and a
NON-AVERAGEABLE breach panel is published beside it. The five conditions below
are normative. The panel is BUILT: the conformance checker beside this document
carries the derived requirements below as check 9, and the reference
implementation publishes the block under ADR 0018, "Publish a non-averageable
breach panel, and relabel three domains as contextual proxies", which also
carries owner decision D5, the relabel of `air`, `ocean` and `biodiversity`
from basis `boundary` to `contextual-proxy`. A document that
publishes no panel is reported as a warning rather than a failure, because
every document published before the panel existed is in that state; a document
that publishes one is checked against every requirement below.

1. **The panel is part of the PUBLISHED DOCUMENT**, not only a score card. A
   consumer reading the JSON gets the breach count and the per-boundary state
   without scraping a UI.
2. **Every entry cites its threshold.** Each entry names the boundary, its
   control variable, the published threshold, the current value, and the source
   for the threshold. No boundary appears without a citation.
3. **Only domains whose indicator IS the accepted control variable may
   appear.** Proxy domains are excluded and say so. Today that admits
   `land-cover` (forest remaining as a share of potential forest, section 3.3) and
   `ocean-acidification` (Omega_arag), and excludes `air` by name (PM2.5 is not
   the aerosol control variable), `ocean` (SST anomaly is not CO2 or radiative
   forcing) and `biodiversity` (richness is not extinction rate or HANPP), plus
   every `contextual-proxy` domain.
4. **"unknown" is published, never omitted.** A boundary the implementation
   cannot evaluate is present with state `unknown`. A missing boundary and a
   safe boundary MUST NOT look alike.
5. **The headline and the breach count sit together** wherever either is shown.
   The number never appears alone.

### 6.1 Two evaluation modes (R1, ratified 2026-09-22)

RK-125 found that five of the nine boundaries have no candidate input, live
or otherwise: no public feed this product can ingest on a schedule reaches
land-system change, freshwater change, biogeochemical flows, biosphere
integrity or novel entities. The owner decided to publish those five from a
pinned published edition rather than leave them `unknown` forever. That is
the ADR 0018 amendment of 2026-09-18, Accepted 2026-09-22, and this section is
its normative text.

Every entry states which of two evaluation modes produced it:

- **live** - the control value is computed from a feed this product ingests on
  a schedule, with provenance and staleness published (condition 3 above still
  governs which domain, if any, is the accepted control variable). A live
  entry whose feed published nothing this refresh carries its last good value
  with the date it was current and its staleness.
- **assessed** - the control value and its state are taken from the published
  edition pinned in the panel (today the Planetary Health Check 2025). The
  entry carries an `assessment` object with a non-empty `edition`, the `year`
  the cited value is for, a non-empty `citation`, and the edition's `value`
  (or `null` where the edition prints none). An assessed entry is refreshed
  only when a new edition is pinned by decision, never on the product's own
  refresh schedule, and it is never presented as live.

`mode` is one of `live`, `assessed` or `unknown`, and it is `unknown` exactly
when the state is `unknown`. Two further rules:

- The breach count is published as two numbers, `liveBreachCount` and
  `assessedBreachCount`, counted over the transgressed entries of each mode,
  and no expression in the document sums them. A reader who wants a total adds
  them at read time and sees the two sources doing it. This is the same
  discipline the framework's own count is held to: a measurement and a
  citation are never blended into one number. A panel with modes MAY keep
  `breachCount` for older readers; if it does, `breachCount` means what it
  meant in 1.0.0, this product's own measurement, and equals
  `liveBreachCount`.
- State is computed from the value against the published threshold in both
  modes: for an assessed entry, from `assessment.value`. A boundary with no
  numeric control variable in the pinned edition (novel entities) is
  published `mode: "assessed"` with the edition's qualitative state and
  `assessment.value: null`. This is the null-value case conditions 2 and 4
  already allow, labeled with the mode that produced it; it is not a fifth
  state.

The allocation of boundaries to modes is what feeds exist, not a rule. As
ratified: live for climate change, ocean acidification, atmospheric aerosol
loading and stratospheric ozone depletion; assessed for land-system change,
freshwater change, biogeochemical flows, biosphere integrity and novel
entities. A boundary moves to live the day a feed exists for it, with no
amendment; land-system change moves when the section 3.3 forest-area input
publishes.

Derived requirements a conforming panel satisfies (these become the tests):

- The panel enumerates all nine planetary boundaries (climate change, biosphere
  integrity, land-system change, freshwater change, biogeochemical flows, ocean
  acidification, atmospheric aerosol loading, stratospheric ozone depletion,
  novel entities) on every refresh. Seven honest unknowns are a more accurate
  statement than a five-row panel that implies the rest are someone else's
  problem.
- State is computed from the published control VALUE against the published
  THRESHOLD, never from the domain's normalized health. This is the exact
  defect of consensus C5: a health of 94.5 must not be read as "safe" when the
  control value is past the boundary.
- `breachCount` equals the count of entries with `transgressed: true` and
  appears in no weighted or averaged expression. It does not enter the
  headline.
- `state == "unknown"` if and only if the value and `transgressed` are both
  absent. `transgressed` is tri-state: true, false, or absent.
- An entry evaluated from a `synthetic` or `class-estimated` input carries its
  provenance and is marked `provisional`; it still produces a state. Forcing
  such entries to `unknown` would empty the panel on the very day the audits
  found a transgressed boundary scored at 94.5.
- The framework's own count of transgressed boundaries (seven of nine per the
  Planetary Health Check 2025, as the audits cite it) MAY be published beside
  the panel as context, in its own object, and is never summed into
  `breachCount`.
- Section 6.1: every entry carries `mode` in `{live, assessed, unknown}`,
  `unknown` exactly when the state is; an entry with `mode: "assessed"`
  carries an `assessment` with a non-empty edition, a year and a non-empty
  citation; the panel publishes `liveBreachCount` and `assessedBreachCount`
  as two separate fields, each equal to its mode's transgressed entries, and
  a `breachCount` published beside them equals `liveBreachCount`, never the
  sum.


### 6.2 The averaging window of a live control value (R2, ratified 2026-09-22)

Ratified by the owner on 2026-09-22 (RK-135, RK-136).

A live entry evaluates the control variable ON THE BASIS ITS THRESHOLD IS
STATED ON. A value on a shorter basis is a different quantity and is not
compared against that threshold.

- **Atmospheric aerosol loading.** The control variable is the interhemispheric
  difference in aerosol optical depth, and the boundary (0.10) and the
  high-risk line (0.25) the panel cites, like the Planetary Health Check 2025
  value (0.063), are stated on its ANNUAL mean. A conforming live entry
  therefore evaluates the mean of the trailing 12 monthly differences (the 12
  most recent published months, consecutive, ending at the newest), each month
  computed as northern-hemisphere mean minus southern-hemisphere mean of that
  month's published AOD field. It is published only when all 12 months are
  present. When a month is missing, the entry keeps its last complete 12-month
  value with its staleness, or is `unknown` if none exists; it never falls back
  to fewer months. A single month is never evaluated alone: one boreal-summer
  month is biased high by the Northern Hemisphere fire and dust season (the
  reference implementation's July 2026 month alone read 0.1118, which would
  have shown the boundary crossed on a seasonal artifact), and a winter month
  is biased the other way.
- The entry names the window it evaluated ("12-month mean ending YYYY-MM"),
  and the source object records the 12 months used with each month's two
  hemispheric means and difference, so the mean can be recomputed from the
  published record.
- Staleness (section 5.4) is measured from the newest month in the window.

Worked reading of the panel as first specified, on the 2026-09-11 document
(before modes existed): ocean acidification at Omega 2.7 is transgressed under
both threshold editions in circulation (Richardson et al. 2023: boundary 2.75,
uncertainty to 2.4; Planetary Health Check 2025: boundary 2.86, high-risk line
2.75); only the severity label moves. Land-system change at 62 percent
remaining is transgressed against the framework's 75 percent boundary with a
54 percent high-risk line. Two evaluated, two transgressed, seven unknown. The
1.1.0 score normalizer used a 30 percent floor that was not the framework's;
under 1.2.0 (R4, section 3.3) the score and the panel read against the same 75
and 54.

Worked reading under 1.2.0, on the same inputs as the ocean-acidification
lane's before-and-after (2026-09-21): the ocean-acidification entry moves from
assessed 2.84 to live 2.83 (the monthly Copernicus Marine surface aragonite
field, area-weighted global mean for 2026-08); live over-threshold entries 3 of
4, assessed 5; headline 62.6, unchanged by the panel.

The owner questions Q1 to Q10 of the panel proposal (OQ-8) are answered by
ADR 0018 (Accepted 2026-09-16), its amendment (Accepted 2026-09-22) and R4;
section 10 records each answer.

---

## 7. Conformance

### 7.1 A conforming DOCUMENT

A conforming E+ document contains, at minimum:

1. `meta.schema`, `meta.methodologyVersion`, `meta.generatedAt`, and a
   `meta.disclosure` that carries the derivability correction sentence and the
   missing-data sentence of section 4.2 verbatim in substance.
1a. `meta.eplusVersion`: a semver string naming the version of THIS STANDARD
   the document conforms to. First value `1.0.0`. It is distinct from
   `meta.methodologyVersion`, which remains the IMPLEMENTATION version (0.4
   through 0.8 to date) and is a different thing: a consumer needs to know
   which rules a document was written against without inferring it from the
   producer's release history (owner decision D4, 2026-09-13). A document
   without `meta.eplusVersion` does not conform to 1.0.0. A document written
   against this version names `1.2.0`.
2. `meta.weights` for every domain, `meta.domainBasis`, `meta.domainScience`
   (control variable, units, safe, high risk, normalization, citation, basis
   per domain), and `meta.derivation.rawWeightSum`.
3. `meta.derivation`: the headline, what it is, the exposure total, the ordered
   steps, the rounding rules, the per-region contributions, and how to
   reproduce it.
4. `regions` with, per region: `score`, `confidence`, `measuredCoverage`,
   `exposure`, `subScores[]` (each with `layerId`, `normalized`, `direction`,
   `weight`, `provenance`, `synthetic`, and `controlValue` where one exists),
   and `notApplicableDomains`; and, where a domain is in warm-up (section
   3.6), `warmUpDomains` and `warmUpReadings[]`. No entry in `subScores` rests
   on a synthetic input (R6, section 3.8).
5. `global` with `score`, `trend`, `confidence`, `measuredCoverage` and
   `subScores[]`.
6. The provenance block of section 5: the ladder, its source, the freshness
   window for daily sources, `domainProvenance` (with `cadenceHours`,
   `lagHours` and `freshnessWindowHours` for every domain whose source is not
   daily), `isLive`, `weightCarryingDomains`,
   `notLiveDomains`, `stale`, `staleDomains`, `oldestSourceVintage`,
   `vintagelessDomains`, `measuredCoverage`.
7. `meta.globalRingDiagnostic` (or an equivalent labeled diagnostic) wherever
   a superseded headline rule is retained for continuity.
8. The breach panel of section 6, with the modes of section 6.1 and the
   averaging window of section 6.2. A document without a panel MUST state in
   `meta.disclosure` that the aggregation has no breach term.

A document that carries a history (`earth.healthscore.history.v1` in the
reference implementation) that includes reconstructed days MUST carry
`reconstructed`, `reconstructedThrough` and `reconstructionMethod`, and MUST NOT
describe itself as accruing from a ship date when 172 of its days are
reconstruction (audit finding S2, corrected in 0.8).

### 7.2 A conforming IMPLEMENTATION

A conforming implementation MUST be able to PROVE, from its published document
alone, with no private input, no source grid, no service account, no repository
constant and no network call other than fetching the document:

1. Every `subScores[].weight` equals `meta.weights` for that domain.
2. Every region `score` is `round1( sum(normalized x weight) / sum(weight) )`
   over that region's published sub-scores.
3. Every region `confidence` is `round2( availWeight / (rawWeightSum - sum of
   notApplicable weights) )`. A document without per-region
   `notApplicableDomains` is NOT conformant.
4. `global.score` is `round1( sum(score x exposure) / sum(exposure) )` over the
   published regions. The failure message names the headline: **THE HEADLINE IS
   NOT DERIVABLE FROM THIS DOCUMENT.**
5. `global.confidence` and `global.measuredCoverage` are the same exposure
   weighting of the per-region values.
6. Every `global.subScores[].normalized` is the exposure-weighted mean of the
   regional values for that domain.
7. `meta.isLive` is false whenever any weight-carrying domain fails section
   5.3, and a document that claims live for a `synthetic` input is REJECTED.
   The rejection names the domain and the clause it fails. `meta.notLiveDomains`
   and every per-domain `fresh` flag are recomputed the same way, and every
   sub-score repeats the provenance its domain declares (section 5.2), so a
   reader of one number cannot be told something the provenance block
   contradicts. This check is implemented in the reference checker as of
   2026-09-13; the earlier note here that it was "not yet in that checker" is
   superseded by section 7.3.
8. A tampered document (any published number altered) is REJECTED.
9. The breach panel follows section 6 and, where entries carry modes, section
   6.1: each mode count is recomputed from its own entries and no count is
   their sum.
10. No weight-carrying fire sub-score rests on a baseline of fewer than 30
    days, and a warm-up reading (section 3.6) carries no weight: it is not in
    `subScores`, its weight leaves the confidence denominator of item 3, and
    it is declared synthetic.
11. No weight-carrying sub-score rests on a synthetic input (R6, section 3.8).
    A document that names `meta.eplusVersion` 1.2.0 or later and scores a
    synthetic input is REJECTED, and the rejection names the domain. A
    document that names an earlier version was written against a draft that
    allowed it, so the checker reports it as a warning there.

Item 3 reads, in full under 1.2.0: `round2( availWeight / (rawWeightSum -
sum of notApplicable weights - sum of warmUp weights) )`. Item 7 applies each
domain's own window (section 5.3, R7), and where a domain publishes both
`cadenceHours` and `lagHours` its `freshnessWindowHours` MUST be their sum.

The checker MUST read weights from `meta.weights`, never from the producer's
constants, and MUST import nothing from the producer, so a producer bug cannot
be canceled by the same bug in the checker. It MUST be shown to FAIL: the
reference test suite runs it against byte-for-byte fixtures of the real
2026-09-10 (63.4 published, 58.95 rollup) and 2026-09-11 (63.8 published, 59.2
rollup) documents, where it must fail and name the headline, and then against a
0.8 document, where it must pass. A conformance test that has only ever said
PASS is a comment.

### 7.3 The reference conformance test

Owner decision D1 condition 2: the reproducibility script ships, runs against
the published JSON alone, and becomes the conformance test when E+ is
standardized. Owner decision D6 (2026-09-13) settled where it lives: THIS
REPOSITORY IS ITS SINGLE CANONICAL HOME, and it is NOT mirrored anywhere.

It lives at `eplus/v1/conformance/` beside this document:

```
eplus/v1/conformance/src/index.ts   the checker (zero imports; checks 1 to 11
                                    above, plus 1a as a warning)
eplus/v1/conformance/src/cli.ts     the command line (exit 0 conformant, 1 not,
                                    2 unreadable; default target the reference
                                    implementation's live document)
eplus/v1/conformance/out/           the compiled JavaScript, committed, so that
                                    installing the package never runs a compiler
eplus/v1/conformance/test/          the checker's own suite, plus a gate that
                                    refuses any committed output that is not a
                                    byte-identical rebuild of the source
eplus/v1/conformance/README.md      run instructions for a third party
```

Anyone can run it against any implementation's document, with no account and no
access to any producer's source data:

```
CHECKER=https://codeload.github.com/random-knights/standard/tar.gz/main
npx --yes $CHECKER                       # the live document
npx --yes $CHECKER ./health-score.json   # a local copy
npx --yes $CHECKER --strict              # see below
```

or from a clone, with `node eplus/v1/conformance/out/cli.js <document>`.

CHECK 1a IS A WARNING, NOT A FAILURE, BY DEFAULT. `meta.eplusVersion` is
normative (section 7.1 item 1a) and the reference implementation does not emit
it yet. Making it fatal would mean the published checker could not ship until
the producer caught up; dropping it would mean this document and the checker
said different things. So the checker prints the gap on every run, exits 0 on
warnings alone, and promotes every warning to a failure under `--strict`. The
strict run is the gate that proves conformance, and it is not green for the
reference implementation today. Check 11 (R6) follows the same logic by
version: a finding for a document that claims 1.2.0 or later, a warning for
one that claims an earlier draft or names no version, and a finding under
`--strict` either way.

THE PRODUCER CONSUMES THIS PACKAGE; IT DOES NOT COPY IT. The reference
implementation (the private `ruok` repository) declares
`@random-knights/eplus-conformance` in `functions/package.json` pinned to a
commit of this repository, and its own suite imports the checker from that
dependency. The fail-first fixtures stay with the producer: byte-for-byte
copies of the real 2026-09-10 (63.4 published, 58.95 rollup) and 2026-09-11
(63.8 published, 59.2 rollup) documents, where the checker must fail and name
the headline, and a 0.8 document built by the producer, where it must pass.
Those are evidence about that implementation, so they belong beside it; the
checker's own suite here uses hand-built minimal documents whose arithmetic is
written out as literals.

Mechanism (b) of decision D6, a hash-gated copy, was not chosen because this
repository is public and the producer's is private, so the gate could only run
on the private side, and a gate that reports drift still leaves two copies to
drift between runs. Two copies of one rule is the drift condition this
workspace keeps paying for.

### 7.4 What conformance does NOT certify

Conformance says the published numbers follow from the published parts and the
document tells the truth about its inputs. It does not say the inputs are
good. An implementation with seven synthetic domains that declares them
synthetic conforms. One with nine live domains that claims a normalizer it does
not compute does not.

---

## 8. Interoperability

- **AiEDs 2.1.0** - the provenance ladder is shared verbatim (section 5.1). An
  E+ document MAY carry a device AiEDs figure and MUST mark it
  `blendedIntoScore: false`.
- **Planetary boundaries framework** (Steffen et al. 2015; Richardson et al.
  2023; Planetary Health Check 2025) - the breach panel names boundaries by the
  framework's names and control variables, not by E+ domain ids, so a panel
  row can be read against the framework's own reports.
- **Kunming-Montreal Global Biodiversity Framework Target 3** - the
  conservation domain is scored against 30x30 as a response indicator, and is
  labeled `contextual-proxy` because Target 3 is a policy target, not a
  planetary boundary.

---

## 9. Governance

1. **A `methodologyVersion` flip requires an Accepted ADR BEFORE the default
   changes.** Owner decision D3, recorded in ADR 0012 and mirrored beside the
   constant in the reference implementation. Where code comments and an ADR
   disagree, the ADR is the record. Absence of this rule is what produced ADR
   0012's amendment: the code asserted "ratified" for two months while the ADR
   read "Proposed".
2. A weight, direction, basis, domain set, normalizer constant or
   renormalization rule may not change without an owner-ratified ADR (ADR 0008
   freeze rule), and every such change bumps the implementation methodology
   version.
3. Every change that moves a public number or changes how a public number is
   derived is recorded in the implementation changelog above with the old
   number, the new number, and whether it is a change in the method or in the
   world. The changelog is append-only.
4. **Two version series, not one.** This document carries the E+ STANDARD
   version (semver, 1.2.0 here). The reference implementation stamps its own
   `methodologyVersion` (0.4 through 0.8 to date) in every document. The
   implementation series predates the standard and is not renumbered. A
   document names the standard version it conforms to in `meta.eplusVersion`
   (section 7.1, item 1a; owner decision D4).
5. Implementation 0.8 has no ADR of its own. It landed the same day the rule in
   item 1 was written. ADR 0012 records the bump so the series has no gap, but
   recording is not ratifying: 0.8 still owes its own ADR. Owner action.
6. Text and data in this document are CC BY 4.0. Forks may adapt the
   methodology but must attribute and use a distinct version prefix.

---

## 10. Decided, Dated and Open Questions

Three lists, kept apart on purpose. DECIDED items have an owner decision and a
recorded home for the work. DATED items are known defects with a resolution
plan and a release they belong to. OPEN items are undecided: this document does
not answer them and an implementation MUST NOT read a default into them. An
item moves between lists only by a dated owner decision recorded here.

### Decided (owner decisions D4 to D6, 2026-09-13)

- **OQ-1 Standard version stamp. DECIDED (D4).** A published document carries
  `meta.eplusVersion`, first value `1.0.0`, beside `meta.methodologyVersion`.
  Normative in section 7.1, item 1a.
- **OQ-5 Basis labels. DECIDED (D5), DONE.** `air`, `ocean` and `biodiversity`
  are `contextual-proxy`, under ADR 0018 (Accepted 2026-09-16), shipped with
  the breach panel. Section 2 records the labels.
- **OQ-9 Publishing the checker. DECIDED (D6).** The conformance checker is
  published from this repository as its single canonical home, consumed by
  ruok as a pinned dependency; not mirrored. Mechanism and reason in section
  7.3.

### Decided (owner ratification of 1.2.0, 2026-09-22)

- **OQ-2 Fire percentile finalization. DECIDED (R3).** The percentile of
  section 3.6 is the fire normalizer and the fire input is on; the field names
  are the `baseline` block of section 3.6; warm-up (N under 30) publishes no
  weight-carrying sub-score, with the visible, no-weight representation of
  section 3.6 as the conforming alternative. The cross-processing calibration
  is not decided by this and is listed under Dated.
- **OQ-3 Land cover. DECIDED (R4).** The denominator is potential forest from
  RESOLVE Ecoregions 2017 forest biomes 1 to 6, the canopy threshold is 15
  percent, the high-risk floor is 54, and decision D8 is lifted (section 3.3).
  The headline change is stated in the implementation changelog when the
  input flips, before it publishes.
- **OQ-8 Breach panel decisions. DECIDED.** Answered by ADR 0018 (Accepted
  2026-09-16), its amendment (Accepted 2026-09-22) and R4: the zone of
  uncertainty counts as a breach, with a separate high-risk sub-count; the
  threshold edition is the Planetary Health Check 2025, with the superseded
  Richardson et al. 2023 pair retained; the land-cover value evaluated is
  forest remaining as a share of potential forest (section 3.3); a synthetic
  input still produces a panel state, marked provisional (a panel reading is
  not a score input, so R6 does not remove it); the basis labels were fixed in
  the same release; the agent's zone wording reads the published panel; all
  nine boundaries are enumerated; the framework's own count is published
  beside ours in its own object and never summed; a threshold the source does
  not print ships null with a note; the breach count enters the daily history
  as one integer. The two evaluation modes are section 6.1.
- **R2, R5, R6, R7** are recorded where they apply: sections 6.2, 3.7.1, 3.8
  and 5.3.

### Dated (owner decision D7, 2026-09-13)

- **OQ-7 The `global` pseudo-region. DATED, not answered.** `global` stays
  both a published region and a member of the headline rollup for now (audit
  RISK-1). It is resolved in its OWN release, after the breach panel lands,
  with its own changelog line stating that the headline moves from 59.20 to
  57.87 on the 2026-09-11 document and why. Reason: D1 requires that one
  release moves the headline for one reason, and the breach panel release
  already has one. A reader of this section sees a known defect with a plan,
  not an unanswered question.

### Dated (from OQ-2, 2026-09-22)

- **OQ-2a Fire cross-processing calibration. DATED.** The fire baseline is
  VIIRS standard processing and the live reading is near real time; the two
  abut on 2026-05-31 / 2026-06-01 with no shared day. The gap becomes
  measurable once standard processing covers a live day, around 2026-12-22,
  and is calibrated on or after 2026-12-20. Until then the gap is disclosed as
  unquantified (section 3.6).

### Open

- **OQ-4 Ocean acidification threshold edition.** The score's normalizer uses
  the Richardson 2023 safe line (2.75); the citation string also names the
  Planetary Health Check 2025, whose boundary is 2.86 with a 2.75 high-risk
  line. Which edition the normalizer anchors to is a constant change under
  section 9 and is not decided here. (The panel's edition is decided: OQ-8.)
- **OQ-6 Normalizer anchors without a framework source.** The 200 AQI and 250
  umol/m2 full scales, the 2 / 4 deg C SST scales and the categorical glacier
  values (80, 60, 25) are implementation constants with no framework citation
  (consensus C7). They are stated here as what is computed, not as endorsed
  thresholds. Under 1.2.0 two former members leave this list: the land-cover
  floor is now the framework's 54 (R4), and the 50-detection fire full scale
  is retired (R3).
- **OQ-10 The uncertainty interval.** No published number carries one. The
  audits' PM predictions named this; no decision exists.
- **OQ-11 Cryosphere parameters without a framework source.** The sea-ice
  full scale F = 0.40 (a deficit of 40 percent of the 1981 to 2010 median
  reads 0), the +-100 mm w.e. glacier band, the 10-year windows, the equal
  0.5 / 0.5 split and the 18-month glacier staleness rule are Random Knights
  parameters. They are RATIFIED and in force (R5); what stays open is a
  framework source for any of them. No planetary-boundary framework defines a
  sea-ice or glacier control variable, and none of these values carries a
  citation. They are stated as what is computed, not as endorsed thresholds.
- **OQ-12 Biodiversity and conservation sources.** Both domains are absent
  (R6, section 3.8) until a commercially usable source exists for each.
  Permission requests are pending with UNEP-WCMC (Protected Planet coverage
  statistics) and with PIK (the Planetary Health Check biosphere-integrity
  figures). A biosphere-integrity source would measure a different control
  variable from the section 2 richness index, so adopting one is a
  methodology change under section 9 and needs its own ADR. A permission
  granted does not by itself put a domain back in the score.

---

## 11. Out of Scope (v1)

Deferred, and stated so that nobody reads their absence as a claim:

- Every domain on live daily data. Glaciers, biodiversity and human
  modification have no daily product anywhere (section 5.5).
- Freshwater change, biogeochemical flows, stratospheric ozone and novel
  entities as scored domains. They appear in the breach panel, in the
  assessed or live mode of section 6.1 or as `unknown`, with their control
  variables cited; they are not scored.
- A breach veto or any non-compensatory aggregation of the headline. D2
  selected the compensatory mean plus the panel over changing the mean.
- Monthly scoring. Adopted only if the bulk of inputs prove monthly.

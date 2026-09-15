# E+ Methodology

> **STATUS: DRAFT 1.0.0, NOT RATIFIED.** This is the first assembled text of the
> E+ (Earth Health Score) methodology. It describes what the reference
> implementation computes today (implementation methodology 0.8), and it states
> the normative requirements a v1 document and a v1 implementation must meet.
> Nothing in it is new science. Every constant, weight, threshold and number was
> taken from a ratified ADR, from the producer source, from the four independent
> audits of 2026-09-10, or from a recorded owner decision, and each one says
> where it came from. Where something is undecided this text says so in an
> open question rather than filling the gap with a value.

> **License:** CC BY 4.0 rand0m.ai - [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

**Version:** 1.0.0 (E+ standard semver - distinct from the implementation's `methodologyVersion`, see section 9)
**Status:** Draft, awaiting owner ratification
**Effective:** not yet
**Author:** Random Knights, LLC, ORCID https://orcid.org/0009-0006-5066-1693

## CHANGELOG

| Version | Date       | Changes |
|---------|------------|---------|
| 1.0.0   | 2026-09-13 | **DRAFT. First assembled text.** Nine domains and weights as frozen by ADR 0008 and amended by ADR 0012; every normalizer including the v0.7 protected-area saturation and humility ceiling; the coverage-normalized region mean and the v0.8 exposure-weighted headline; the five-rung provenance ladder with the rule that a document MUST NOT declare live for a synthetic or carried-forward input; the non-averageable breach panel under owner decision D2; conformance requirements for documents and implementations; governance. Owner decisions D4 to D7 (2026-09-13) applied in the same draft: `meta.eplusVersion` is a conformance requirement (D4); the `air`, `ocean` and `biodiversity` basis relabel to `contextual-proxy` is decided and waits on its ADR (D5); the conformance checker is published from this repository as its single canonical home at `eplus/v1/conformance/`, runnable by a third party with no producer checkout, and the reference implementation consumes it pinned to a commit rather than keeping a copy (D6); the `global` pseudo-region defect is dated with a resolution plan (D7). The six remaining open questions are listed in section 10 and none of them is answered here. |

## Implementation changelog (public)

This is the public changelog that ADR 0012's rollout step 4 requires and that
its sign-off box 5 was open on. It records every change to the published
Earth Health Score that moved a public number or changed how a public number is
derived, with the OLD number, the NEW number, and why it moved. The rule this
section enforces: **a reader must always be able to tell a change in the
METHOD from a change in the WORLD.** They are not the same event and they must
never look alike.

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

Weights, directions and bases are frozen by ADR 0008 (methodology 0.6,
2026-06-25) and carried forward unchanged by ADR 0012 (0.7, ratified as
amended 2026-09-12). A change to any of them is a methodology version bump and
requires an Accepted ADR BEFORE the default changes (section 9).

| Domain | Weight | Direction | Basis | Control variable | Units | Safe | High risk | Citation |
|---|---|---|---|---|---|---|---|---|
| `land-cover` | 0.25 | benefit | boundary | Forest cover remaining (land-system change) | % cover remaining | >= 75 | <= 30 | Steffen et al. 2015; Richardson et al. 2023 |
| `fire` | 0.20 | burden | contextual-proxy | Wildfire active-fire burden | detections | 0 | >= 50 | NASA FIRMS active fire (contextual signal) |
| `air` | 0.15 | burden | boundary | PM2.5, atmospheric aerosol loading | ug/m3 | <= 5 (WHO 2021 annual guideline) | >= 50 | WHO 2021 Global Air Quality Guidelines; Steffen et al. 2015 |
| `ocean` | 0.10 | burden | boundary | Sea-surface temperature anomaly (climate-change proxy) | deg C vs 1991-2020 | 0 | +2 warm (or -4 cold) | Hobday et al. 2016; IPCC AR6 |
| `ocean-acidification` | 0.10 | benefit | boundary | Surface-ocean aragonite saturation, Omega_arag | Omega | >= 2.75 | 1.0 | Richardson et al. 2023; Steffen et al. 2015; Planetary Health Check 2025 |
| `cryosphere` | 0.10 | burden | contextual-proxy | Glacier mass-balance trend | categorical | improving | worsening | glacier mass-balance (contextual signal) |
| `biodiversity` | 0.10 | benefit | boundary | Species-richness index (biosphere-integrity proxy) | 0 to 100 index | 100 | 0 | Richardson et al. 2023 |
| `conservation` | 0.08 | benefit | contextual-proxy | Protected-area coverage vs the 30x30 target | % area protected | >= 30 (GBF Target 3) | 0 | Kunming-Montreal GBF Target 3 |
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
three labels are DECIDED to become `contextual-proxy` (owner decision D5,
2026-09-13). The relabel is a methodology change under section 9, so it needs
an Accepted ADR before the default changes, and it ships in the same lane as
the breach panel because both change what a client renders. Until that lane
lands, an implementation MAY still publish `boundary` for the three, and a
document that does so is read against this section. See section 10.

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

Two signals: forest at 0.75 and tree-cover vitality at 0.25. Forest is boundary
distance on `remaining = coverPct - max(0, lossDeltaPct)` with safe 75 and high
risk 30. The tree-vitality input is pinned to absent in the reference
implementation, so forest carries the domain today. The land-cover reading in
the reference implementation is a constant table (consensus C3) and is declared
`synthetic` (section 5); the live NASA forest grid is fetched and not yet used.

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

The implementation formula is `health = 100 - (detections / 50) x 100`. It is
pinned OFF by declaration (`FIRE_SCORE_INPUT_ENABLED = false`) because 50
detections as full scale reads any continental box as burning at zero and
would drop a 0.20-weighted zero over most of the populated world. The fire
sub-score is therefore absent from every region today and the domain carries
no weight (consensus C1, now a declared state rather than a key mismatch).

The specified replacement is a **trailing self-sourced percentile** (owner
selection: design S, 2026-09-12). For region `r` on UTC date `d`, with `c` the
detection count in the region's box and `H` the baseline counts:

```
below = count of h in H with h <  c
equal = count of h in H with h == c
p     = (below + 0.5 x equal) / N        midrank empirical percentile, 0..1
fire  = round1( 100 x (1 - p) )          then the humility ceiling
```

No fitted parameter, no cited constant. An all-zero baseline with today at zero
gives p 0.5 and health 50.0: a never-burning region sits at its own median, not
at pristine. The long-run mean of p is 0.5, so the long-run mean fire health is
50.0. The baseline is same-season: for each day-of-year, the days within plus
or minus 15 of it across the baseline years, plus the trailing 15 days of the
current year. The baseline is VIIRS NOAA-20 standard processing, calendar years
2019 to 2025 inclusive (seven complete years, partial years excluded so uneven
per-day-of-year counts cannot read as a spring anomaly), computed once,
versioned, and never recomputed rolling. The live reading is VIIRS NOAA-20 near
real time. The two processing levels abut on 2026-05-31 / 2026-06-01 with no
shared day, so the cross-processing gap cannot be quantified today and MUST NOT
be described as small; it becomes measurable around 2026-12-22.

Warm-up: with fewer than 30 baseline days the domain is published visible but
non-weight-carrying (provenance `synthetic`, excluded from both the numerator
and the confidence denominator), with the raw count still published. Missing
versus zero is a hard rule: a successful fetch with no rows records 0; a failed
fetch records nothing.

Stated limitation, which a conforming document carries in `meta.domainScience`:
this is NOT absolute fire burden. A region that burns catastrophically every
day reads 50.

### 3.7 Cryosphere

Categorical: improving 80, stable 60, worsening 25, unknown absent. The
reference input is regenerated from ten compile-time anchors, so its mean is a
fixed 78.0 and the trend arrow could never read anything but one value; the
producer therefore gates the published trend on a non-synthetic, fresh
cryosphere source (section 4.5).

### 3.8 Biodiversity, conservation, human

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
totalWeight        = 1.18 - sum(weight of notApplicableDomains)
confidence         = round2( sum(weight of published sub-scores) / totalWeight )
measuredCoverage   = round2( sum(weight of published sub-scores with synthetic == false) / totalWeight )
```

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

`trendBasis` is `cryosphere`. A direction is published only when the cryosphere
source is non-synthetic AND fresh; otherwise the trend is `unknown` and
`meta.trendGate` says why.

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
| `unknown` | The source cannot be characterised at all. |

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
`unknown`.

### 5.3 Liveness is computed, never asserted

```
fresh(domain)  = not synthetic AND ageHours <= freshnessWindowHours AND ageHours >= -1
live(domain)   = not synthetic AND available AND rung in {measured, vendor-published} AND fresh
meta.isLive    = every weight-carrying domain is live
```

`freshnessWindowHours` is a disclosed policy constant (48 in the reference
implementation) and is published in the document. The document also publishes
`weightCarryingDomains`, `notLiveDomains`, `staleDomains`,
`oldestSourceVintage` with its domain, and `vintagelessDomains`.

**A document MUST NOT declare `isLive: true` when any weight-carrying domain is
`synthetic`, carried forward past the freshness window, or of rung
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
daily product anywhere; they are declared at their true cadence and provenance
and the document stays conformant. If the bulk of inputs turn out to be
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
   `land-cover` (forested land remaining as a share of original cover) and
   `ocean-acidification` (Omega_arag), and excludes `air` by name (PM2.5 is not
   the aerosol control variable), `ocean` (SST anomaly is not CO2 or radiative
   forcing) and `biodiversity` (richness is not extinction rate or HANPP), plus
   every `contextual-proxy` domain.
4. **"unknown" is published, never omitted.** A boundary the implementation
   cannot evaluate is present with state `unknown`. A missing boundary and a
   safe boundary MUST NOT look alike.
5. **The headline and the breach count sit together** wherever either is shown.
   The number never appears alone.

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

Worked reading, on the 2026-09-11 document, under the proposed panel:
ocean acidification at Omega 2.7 is transgressed under both threshold editions
in circulation (Richardson et al. 2023: boundary 2.75, uncertainty to 2.4;
Planetary Health Check 2025: boundary 2.86, high-risk line 2.75); only the
severity label moves. Land-system change at 62 percent remaining is transgressed
against the framework's 75 percent boundary with a 54 percent high-risk line;
the score's own 30 percent floor is NOT the framework's and is not used in the
panel. Two evaluated, two transgressed, seven unknown.

The threshold values, the edition, the value path, whether the uncertainty zone
counts as a breach, and whether the count enters the history are owner
questions Q1 to Q10 of the panel proposal. They are listed as OQ-8 in section
10 and this document does not answer them.

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
   without `meta.eplusVersion` does not conform to 1.0.0.
2. `meta.weights` for every domain, `meta.domainBasis`, `meta.domainScience`
   (control variable, units, safe, high risk, normalization, citation, basis
   per domain), and `meta.derivation.rawWeightSum`.
3. `meta.derivation`: the headline, what it is, the exposure total, the ordered
   steps, the rounding rules, the per-region contributions, and how to
   reproduce it.
4. `regions` with, per region: `score`, `confidence`, `measuredCoverage`,
   `exposure`, `subScores[]` (each with `layerId`, `normalized`, `direction`,
   `weight`, `provenance`, `synthetic`, and `controlValue` where one exists),
   and `notApplicableDomains`.
5. `global` with `score`, `trend`, `confidence`, `measuredCoverage` and
   `subScores[]`.
6. The provenance block of section 5: the ladder, its source, the freshness
   window, `domainProvenance`, `isLive`, `weightCarryingDomains`,
   `notLiveDomains`, `stale`, `staleDomains`, `oldestSourceVintage`,
   `vintagelessDomains`, `measuredCoverage`.
7. `meta.globalRingDiagnostic` (or an equivalent labelled diagnostic) wherever
   a superseded headline rule is retained for continuity.
8. The breach panel of section 6, once built (OQ-8). Until then the document
   MUST state in `meta.disclosure` that the aggregation has no breach term.

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

The checker MUST read weights from `meta.weights`, never from the producer's
constants, and MUST import nothing from the producer, so a producer bug cannot
be cancelled by the same bug in the checker. It MUST be shown to FAIL: the
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
eplus/v1/conformance/src/index.ts   the checker (zero imports; checks 1 to 8
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
strict run is the gate that proves 1.0.0 conformance, and it is not green for
the reference implementation today.

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
  labelled `contextual-proxy` because Target 3 is a policy target, not a
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
   version (semver, 1.0.0 here). The reference implementation stamps its own
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
- **OQ-5 Basis labels. DECIDED (D5).** `air`, `ocean` and `biodiversity` are
  relabelled `contextual-proxy`. Needs an Accepted ADR under section 9 before
  the default changes, and ships in the same lane as the breach panel because
  both change client rendering. Section 2 records the interim reading.
- **OQ-9 Publishing the checker. DECIDED (D6).** The conformance checker is
  published from this repository as its single canonical home, consumed by
  ruok as a pinned dependency; not mirrored. Mechanism and reason in section
  7.3. Its own lane, after the breach panel.

### Dated (owner decision D7, 2026-09-13)

- **OQ-7 The `global` pseudo-region. DATED, not answered.** `global` stays
  both a published region and a member of the headline rollup for now (audit
  RISK-1). It is resolved in its OWN release, after the breach panel lands,
  with its own changelog line stating that the headline moves from 59.20 to
  57.87 on the 2026-09-11 document and why. Reason: D1 requires that one
  release moves the headline for one reason, and the breach panel release
  already has one. A reader of this section sees a known defect with a plan,
  not an unanswered question.

### Open

- **OQ-2 Fire percentile finalization.** The window rules of section 3.6 are
  the selected design; the exact field names, the warm-up flag and the
  scheduler are lane B2's to define once the owner seed run (about 5110 GETs,
  throttled across at least two quota windows) has completed. The
  cross-processing calibration is due on or after 2026-12-20.
- **OQ-3 Land cover.** When the fetched NASA forest grid replaces the constant
  table (consensus C3), the denominator dataset and the resulting headline
  change must be stated in the changelog before the flip.
- **OQ-4 Ocean acidification threshold edition.** The score's normalizer uses
  the Richardson 2023 safe line (2.75); the citation string also names the
  Planetary Health Check 2025, whose boundary is 2.86 with a 2.75 high-risk
  line. Which edition the normalizer anchors to is a constant change under
  section 9 and is not decided here.
- **OQ-6 Normalizer anchors without a framework source.** The 30 percent
  land-cover floor, the 50-detection fire full scale, the 200 AQI and 250
  umol/m2 full scales, the 2 / 4 deg C SST scales and the categorical glacier
  values are implementation constants with no framework citation (consensus
  C7). They are stated here as what is computed, not as endorsed thresholds.
- **OQ-8 Breach panel decisions.** The ten owner questions of the panel
  proposal: whether the zone of uncertainty counts as a breach (with a
  separate high-risk sub-count); the ocean-acidification threshold edition;
  which published land-cover value is evaluated; whether synthetic inputs still
  produce a state; whether the basis labels are fixed in the same lane; whether
  the agent's zone wording reads the panel; whether all nine boundaries are
  enumerated; whether the framework's own count is published beside ours;
  whether the four boundaries with no numeric threshold in our sources publish
  a null threshold or are sourced first; and whether the breach count enters
  the daily history. Nothing in section 6 presumes an answer beyond the five
  conditions the owner has already given.
- **OQ-10 The uncertainty interval.** No published number carries one. The
  audits' PM predictions named this; no decision exists.

---

## 11. Out of Scope (v1)

Deferred, and stated so that nobody reads their absence as a claim:

- Every domain on live daily data. Glaciers, biodiversity and human
  modification have no daily product anywhere (section 5.5).
- Freshwater change, biogeochemical flows, stratospheric ozone and novel
  entities as scored domains. They appear in the breach panel as `unknown`
  with their control variables cited; they are not scored.
- A breach veto or any non-compensatory aggregation of the headline. D2
  selected the compensatory mean plus the panel over changing the mean.
- Monthly scoring. Adopted only if the bulk of inputs prove monthly.

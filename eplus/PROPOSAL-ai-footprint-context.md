# Proposal: your Ai footprint in context, inside E+

**Status:** DRAFT proposal for owner review. Nothing here is ratified.
**Written:** 2026-10-18 (lane `standard--eplus-ai-context-1018`), updated the
same day with the seven owner decisions of 2026-10-18.
**Companion draft text:** `eplus/drafts/ai-footprint-context-DRAFT.md`
**Option B research:** `eplus/PROPOSAL-option-b-baselines.md`
**Changes no version.** E+ stays at 1.2.1. AiEDs stays at 2.4.0. The draft
carries the working label 1.4.0. The final number is assigned at publish.

## Owner decisions applied (2026-10-18)

1. The word "offset" has one narrow exception. It may appear only inside the
   name of a third-party project, dataset or map layer, in a marked field, as a
   quoted proper name. It never describes anything about the reader's figures.
   The draft has the rule (12.8) and the test vectors (12.11).
2. The standard defines the per-reader report block. Personal numbers never
   appear in the public score document (12.3).
3. With no region set, the region is estimated from the connection, at country
   or state level only. It is labeled, never stored beyond the request, and
   disclosed in the privacy text. A VPN can make it wrong, and the label says
   so. If the estimate fails, the AiEDs global average is used and labeled
   (12.5).
4. Tree-Time is not in the E+ panel. It stays in EQ (12.2, check 20).
5. The version label is 1.4.0 as a draft label. The final number is assigned at
   publish.
6. The banned-word list is a hard checker failure (12.8, check 15).
7. The question of who checks baseline licenses is replaced by the research in
   `eplus/PROPOSAL-option-b-baselines.md`.

## The short version

The owner wants the E+ report to show a reader's own Ai footprint. It should sit
next to the Earth Health Score for the whole globe.

This proposal recommends two steps. Step one puts two labeled panels side by
side, with no arithmetic between them (option A). Step two adds a share of a
cited baseline (option B). It waits until a baseline source is named, licensed
and cleared. Mapping the footprint to the nine domains
(option C) is not recommended, because the honest mapping is almost empty.

## 1. What is true today

E+ 1.2.1 defines:

- An Earth Health Score from 0 to 100, for the planet and for ten regions.
- Nine domains, a coverage-normalized region mean, an exposure-weighted
  headline, and a trend.
- A provenance ladder, a freshness rule, and a breach panel that is never
  averaged.
- A conformance checker with 11 checks, shipped as `@randomknights/earthplus`.

E+ 1.2.1 does not define:

- Any Ai footprint. The 1.2.1 text says so in its own words: "This version
  carries no Ai impact data."
- Any rule for showing a reader's own data. The score document is public and
  the same for everyone.
- Any baseline for energy or carbon.

Three facts shape the design.

1. **Section 1 already limits the link.** It lets an E+ document carry a device
   AiEDs figure. That figure MUST NOT be blended into any score. It is marked
   `blendedIntoScore: false`. The new block reuses that
   idea.
2. **The 1.2.1 banner already promises the tone.** An impact part is "context
   shown beside the score" that "never feeds the score". It is "worded as
   location and modeled demand, never as cause". Co-location is not causation.
3. **The product already has the pieces.** The ruok report document
   (`report-document` 1.0.0) already holds an AiEDs line with Wh, gCO2e and
   Tree-Time minutes. The EQ report already holds a national-average table.
   It is empty on purpose until a cited source exists (owner decision
   2026-10-14).
   What is missing is a rule in the standard.

AiEDs gives two modeled quantities, energy and carbon, and one comparison,
Tree-Time. It has no water figure and no land figure. That limit matters for
option C.

## 2. The goal, and what the standard must never claim

**Goal.** A reader sees the state of the Earth and the modeled size of their own Ai use.
Both are in one view. Each is labeled for what it is.

**The standard must never claim:**

1. That one reader's Ai use changed the Earth Health Score or any part of it.
2. That one reader caused any change in the Earth system. A single reader's
   share is far too small to measure in these data. The standard claims no
   cause either way.
3. Any credit, balance, compensation or cancelling of the footprint. The word
   "offset" is never used.
4. That the score "moves" because of the reader. The score is the same for
   every reader on the same day.
5. That Tree-Time is a credit. Tree-Time is an educational comparison. AiEDs
   2.5 already says so, and this proposal copies the rule. The E+ panel does
   not show Tree-Time at all (owner decision 4). It stays in EQ.

A good test for any wording: would the sentence still be true if the reader
used no Ai at all? If the sentence says the score would differ, it is wrong.

## 3. Design options

### Option A: side by side

Two labeled panels in one view. Panel one is the Earth Health Score, its date
and its scope. Panel two is the reader's modeled energy and carbon, with period,
confidence and region. No Tree-Time. No arithmetic between them.

| Honesty gain | Honesty cost |
| --- | --- |
| Makes no claim a reader could misread as cause. | Gives no sense of scale for the footprint. |
| Needs no new data source, so no new license. | A reader may still read the layout as a link. The wording and the no-line rule must carry that load. |
| Fully checkable: the checker can verify the score copy and the required text. | It does exactly what the owner asked ("right next to"), and no more. |

### Option B: proportion in context

The same two panels, plus a third line. It shows the reader's modeled energy or
carbon as a share of a cited baseline for the reader's region. The baseline
source, year and license are shown.

| Honesty gain | Honesty cost |
| --- | --- |
| Gives scale. A reader can see whether the figure is large or small. | Needs a baseline source that is named, licensed and cleared. None exists in the E+ source catalog today. |
| The share is plain division, so the checker can recompute it. | The share will usually be tiny. A tiny number can read as "nothing to worry about". That is also a claim, and the standard does not make it. |
| | Easy to get wrong: units, period, annualizing, and grid method must all match. See section 5. |
| | A baseline can read as a budget or a target. The text must say it is a scale only. |

### Option C: map to the E+ domains

Map the AiEDs quantities to the domains they could honestly touch.

The honest result is nearly empty:

- Carbon relates to climate change. E+ has no climate-change domain.
  The ocean domain is a sea-surface temperature proxy. The `ocean-acidification` domain is
  driven by CO2, but it is a different control variable. Pointing a reader's
  gCO2e at either one would suggest cause. Section 2 forbids that.
- Land-system change and freshwater use need a cited method and data that
  link an Ai footprint to forest or water. AiEDs has no land or water
  quantity. No such method is in this repository.
- The other six domains have no mapping at all.

So option C would be a table of "no mapping". That is honest, but it is not a
feature. It is a statement the standard can make in one sentence, and the draft
does (section 12.10).

### Recommendation

**Adopt option A now. Specify option B as the next step. Do not adopt option
C.**

Why. Option A needs no new data, no new license and no new judgment. It also
matches the owner's words. Option B adds real value, but only with a cleared
baseline. The repo has a clear rule for that. No number ships without a cited
source (owner decision 2026-10-14). Option C cannot be done honestly with the
quantities AiEDs has.

**Deferred:** option B rules, any baseline source, any mapping to domains, any
water or land quantity, any change to a weight or number. The option B research
is written up in `eplus/PROPOSAL-option-b-baselines.md`.

## 4. Where the block lives

The score document is public. The footprint is about one person. The two must
not share a document.

- The public Earth Health Score document (`earth.healthscore.v1`) MUST NOT carry
  the new block.
- A report document made for one reader or workspace MAY carry it.

This follows the structure that already exists. The standard defines the score
document. The ruok report document is a view built per reader.

The owner has decided (decision 2) that the standard defines the per-reader
block. The rule is firm: personal numbers never appear in the public score
document, under any key name, at any depth. The report document says it is
personal with `meta.audience` set to `"reader"`. The checker reads both kinds of
document. That is a small widening of scope, and it is approved.

### The region for carbon

Carbon needs a grid factor, so the block needs a region.

- If the reader set a region, use it.
- If not, estimate one from the connection. Country or state only. Label it
  "estimated from your connection, change it". Say that a VPN can make it
  wrong. Do not store it beyond the request. Say so in the privacy text.
- If the estimate fails, use the AiEDs global average and label it.

The estimate never raises the confidence label. A guessed region is a reason to
say so, not a reason to trust the figure more. The document cannot show what a
server stores, so "do not store" rests on the document check plus a written
statement from the implementer. The draft says this plainly (12.5).

## 5. Data and licensing

Every baseline needs five things before it can be used:

1. A named source.
2. A license that allows the use, with the text shown.
3. An update cadence.
4. A vintage year, shown next to the number.
5. A confidence label.

If any one is missing, the baseline is left out and named. This follows the
excluded-sources pattern in the ruok report builder. Its license gate treats
"unknown" and "to confirm" as not cleared.

### Sources already in the E+ catalog

The nine domains cite these. None is an energy or carbon baseline for a person
or a country, so none can serve option B.

| Source | Used for | License note |
| --- | --- | --- |
| NASA FIRMS | fire | not re-checked in this lane |
| NSIDC Sea Ice Index G02135 | cryosphere | not re-checked in this lane |
| WGMS Fluctuations of Glaciers | cryosphere | not re-checked in this lane |
| WHO 2021 Air Quality Guidelines | air | threshold, cited |
| RESOLVE Ecoregions 2017 | land cover | not re-checked in this lane |
| Global Human Modification | human | not re-checked in this lane |
| Copernicus, NOAA | several | the ruok license gate classes both as allowed |

### Already in AiEDs

AiEDs Table 3 holds grid carbon intensity (gCO2e per kWh) for 14 regions, each
with a cited source. That is the grid factor used to make the reader's carbon.
It is not a per-person baseline. Whether the sources behind that table allow
republishing as a baseline is also "to confirm".

### New sources a baseline would need

All of these are candidates. License and cadence are written from general
knowledge. They were NOT verified in this lane. Each is "to confirm" until the
owner or a data lane reads the live terms.

| Candidate | Would give | License | Cadence | Status |
| --- | --- | --- | --- | --- |
| Ember yearly electricity data | electricity by country | believed CC BY 4.0 | yearly | to confirm |
| Our World in Data energy and CO2 sets | per-person electricity and CO2 | believed CC BY 4.0 | yearly | to confirm |
| World Bank electric power use per person | per-person electricity | believed CC BY 4.0 | yearly, with lag | to confirm |
| Global Carbon Project national CO2 | national fossil CO2 | believed CC BY 4.0 | yearly | to confirm |
| EDGAR (EU JRC) | national emissions | believed CC BY 4.0 | yearly | to confirm |
| US EIA | US electricity per person | believed US government, open | monthly and yearly | to confirm, US only |
| IEA data | electricity and emissions | restricted, paid for most sets | yearly | to confirm, likely excluded |

### Traps a baseline must avoid

- **Period.** Compare the same span. Never stretch a short period into a year.
- **Unit.** Wh against kWh is a factor of 1,000.
- **Method.** Grid carbon can be location-based or market-based. Use one and
  say which.
- **Region.** The reader's region for the grid and for the baseline must match.
- **Scale.** The share will usually be very small. The text states the
  number and the scale, and does not say it is small, safe or negligible.

## 6. Confidence and limits language

Every report with the block prints these two sentences, exactly:

- Energy and carbon are modeled estimates.
- Tree-Time and equivalents are educational comparisons.

It also prints one more sentence, exactly:

```
The Earth Health Score does not use this footprint, and this footprint does not move the score.
```

Other rules:

- Confidence comes from AiEDs (`high`, `med`, `low`) and is never raised.
- The footprint panel names the period, the AiEDs version and the grid region.
- A missing footprint says "no reading" and why. It is never zero.
- These words and phrases are banned in any text the block makes. A hit is a
  hard checker failure, not a warning:

```
offset, credit, neutral, compensat, cancel, caused by you, because of you, your use moved
```

- One narrow exception. "offset" may appear inside the name of a third-party
  project, dataset, map layer or registry, in a marked `thirdPartyNames` field,
  as a quoted proper name with its kind and https source address. It never
  describes the reader's figures. The other banned terms have no exception.
  Rules and vectors are in draft 12.8 and 12.11.

## 7. Document contract changes

### The block

An optional top-level block named `aiContext` in an E+ report document. The
full shape and rules are in the draft, section 12.4. In short:

```json
{
  "aiContext": {
    "mode": "juxtaposition",
    "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "subject": { "kind": "viewer", "label": "string" },
    "footprint": {
      "reading": "reading",
      "energyWh": null,
      "carbonGco2e": null,
      "confidence": null,
      "provenance": null,
      "aiedsMethodologyVersion": "2.4.0",
      "regionForGrid": null
    },
    "earthScore": { "score": 0.0, "asOf": "ISO 8601", "scope": "global" },
    "baseline": null,
    "blendedIntoScore": false,
    "statements": { "modeled": "...", "educational": "...", "noCause": "..." }
  }
}
```

The values are shape only. They are not data. A real report fills them from
the AiEDs record and the live score, or shows "no reading". This sketch is the
short form. The full shape, with `meta.audience`, `region` and
`thirdPartyNames`, is in the draft, section 12.4. The sketch has no Tree-Time
field, by owner decision 4.

### Null and "no reading"

- No footprint: `reading` is `"no reading"`, and the three figures,
  `confidence` and `provenance` are `null`.
- A real zero: `reading` is `"reading"` and the figure is `0`.
- Zero is never used to mean missing.
- The Earth Health Score panel always shows, with or without a footprint.

### Version number

This is an additive, optional block. The standard's own pattern is a minor
version for that. Version 1.1.0 added breach-panel fields the same way.

The draft is labeled **1.4.0**. That is a working label. The final number is
assigned at publish. 1.3.0 is already held by a PROPOSED rule (R8, the second
land-cover source), still pending ratification, so 1.3.0 would collide with it
today.

A document that names the final number in `meta.eplusVersion` MAY carry
`aiContext`. A document that names an earlier version MUST NOT. No existing
rule, weight or number changes.

### Conformance checker rules to add

Numbering continues from check 11. Full wording is in the draft, section 12.10.

| # | Rule |
| --- | --- |
| 12 | Personal numbers stay out of public documents. `aiContext` needs `meta.audience` of `"reader"`. |
| 13 | `blendedIntoScore` is the literal `false`, and the headline still derives with the block removed. |
| 14 | The three required sentences are present and exact, plus the region sentences when they apply. |
| 15 | No banned term appears in the block. The one exception is "offset" inside a marked third-party name. Hard failure. |
| 16 | Null handling: "no reading" has null figures; a reading has finite, non-negative figures; zero never stands for missing. |
| 17 | `earthScore` equals `global.score` and its date. |
| 18 | In side-by-side mode, `baseline` is `null` and no ratio, share or difference is present. |
| 19 | Region source and level are valid, an estimated region has a privacy notice, and no address or coordinate key appears. |
| 20 | No Tree-Time key appears in `aiContext`. |

### Test vectors

These are test vectors for the checker. They are NOT data and MUST NOT be
shipped or shown to a reader. Each carries `"testVector": true` in the real
fixture, and the checker's own fixtures keep that flag.

| Id | What it holds | Expected |
| --- | --- | --- |
| TV-1 | A reading, reader audience, reader-set region, exact sentences | pass |
| TV-2 | `reading` is "no reading", both figures null | pass |
| TV-3 | A true zero energy reading with `reading` set to "reading" | pass |
| TV-4 | No `aiContext`, public document | pass (unchanged from 1.2.1) |
| TV-5 | Region estimated from connection, both region sentences, privacy notice | pass |
| TV-6 | Global average region, its sentence exact, null code | pass |
| TV-7 | `thirdPartyNames` holds a layer named "carbon-offset-projects" with an https URL | pass |
| FV-1 | `blendedIntoScore` is true | fail, check 13 |
| FV-2 | "no reading" with energy 0 | fail, check 16 |
| FV-3 | A statement contains a banned term | fail, check 15 |
| FV-4 | `earthScore.score` differs from `global.score` | fail, check 17 |
| FV-5 | A required sentence is missing or changed | fail, check 14 |
| FV-6 | `aiContext` inside a public document | fail, check 12 |
| FV-7 | `baseline` present in side-by-side mode | fail, check 18 |
| FV-8 | "offset" in `statements` | fail, check 15 |
| FV-9 | "offset" in `footprint.provenance` | fail, check 15 |
| FV-10 | "offset" in a third-party name with no source address | fail, check 15 |
| FV-11 | "Offsets" or "off-set" in `subject.label` | fail, check 15 |
| FV-12 | "offset" in a `name` key outside `thirdPartyNames` | fail, check 15 |
| FV-13 | "credit" inside a third-party name | fail, check 15 |
| FV-14 | A public document with `energyWh` under another key path | fail, check 12 |
| FV-15 | Estimated region with no VPN sentence | fail, check 14 |
| FV-16 | Region holds a `city` key | fail, check 19 |
| FV-17 | Global-average source with level "country" | fail, check 19 |
| FV-18 | A Tree-Time key in `aiContext` | fail, check 20 |

## 8. Rollout

Order matters. Each step waits for the one before.

| Step | Where | What | Repos touched |
| --- | --- | --- | --- |
| 0 | owner | Review this draft. Answer the open questions. Ratify, or not. | none |
| 1 | standard lane | Move the draft into the methodology as a new section. Bump the version. Add checks 12 to 18, the vectors, the README, and `CITATION.eplus.cff`. Rebuild the committed `out/`. Run the version fan-out in `docs/STANDARD-VERSION-SYNC.md`. | `standard` |
| 2 | reference library lane | Release `@randomknights/earthplus` with the new checks. If the owner wants a shared builder helper, add it as a small pure function. | `standard` (packages/earthplus, and lib/ only if a helper is wanted) |
| 3 | ruok lane | Add `aiContext` to the E+ report builder, types and JSON schema. The report document gains an optional field, so its schema version takes a minor bump. Pin the new checker. Fill the block from the AiEDs record and the live score, or "no reading". | `ruok` (functions/src/reports, docs/reports) |
| 4 | knightly lane | Draw the two panels on the E+ report page, with the required sentences. No line, arrow or color between them. Render at the four standard sizes. | `knightly` (public/reports/eplus, scripts/reports) |
| 5 | docs lane | Update the E+ pages that describe the standard: the site docs and the about text. | `xyz` (and `standard` site build if needed) |
| 6 | later, if option B is wanted | Name and clear a baseline source. Draft the option B rules. Repeat steps 1 to 4. | as above |

Not in this proposal: publishing, tagging, deploying, or merging. Those stay
with the owner.

## 9. Still open

The seven decisions of 2026-10-18 closed the earlier list. What remains:

1. Do you approve option A first, with option B only after the research in
   `eplus/PROPOSAL-option-b-baselines.md` is read and a baseline is chosen?
2. Which IP-to-region service will the reference implementation use, and do its
   own license and privacy terms allow it? The draft names none.
3. AiEDs Table 3 has a `global_average` row (436 gCO2e/kWh, cited to IEA 2023,
   `spec/methodology.md`). The app surface pins a different constant, 429. Which
   one does the E+ block use when no region is known? The draft says the Table 3
   row. Confirm that, and see the IEA license finding in
   `eplus/PROPOSAL-option-b-baselines.md`.
4. Does the checker read a report document through the same package entry or a
   new one? That is an implementation choice for step 2 of the rollout.

## 10. What was not verified

- Baseline licenses are no longer all "to confirm". The research file reads each
  publisher's own page and marks what it could not read. See
  `eplus/PROPOSAL-option-b-baselines.md`. The older table in section 5 of this
  file is kept as written and is superseded by the research file.
- The IP-to-region service is not chosen, so its terms are not read.
- This lane changed no checker code. The checks are described, not built. The
  existing test suite was run to show that adding these files breaks nothing.

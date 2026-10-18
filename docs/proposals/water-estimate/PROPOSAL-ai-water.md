# PROPOSAL (DRAFT): a modeled water estimate for AiEDs

**Status:** DRAFT proposal. Not ratified. No normative change.
**Lane:** standard--aieds-water-1018
**Date:** 2026-10-18 (every source below was checked on this date)
**Update 2026-10-18 (evening):** the owner read the LBNL report and the
blocked license pages by hand, and decided two points. See section 2.1.
**Implies:** AiEDs 2.5.0 (draft number; the owner assigns the final number at publish)
**Companion:** `ai-water-DRAFT.md` in this folder holds the proposed rule text.
**Folder note:** the repo had no `docs/proposals/` folder and no drafts
convention. This folder is new. `docs/` holds only one file today.

## Summary (11 lines)

1. The owner asked if research on Ai water use is good enough to add a water estimate.
2. Yes, if it is shown as a range, with low confidence, and for inference only.
3. Ai uses water in two places: to cool the data center, and to make the electricity.
4. We would count water consumed (gone from the local source), not water withdrawn.
5. The formula is the same shape as carbon: energy times a water factor.
6. Default factor: 0.36 L per kWh on site, plus 4.52 L per kWh at the power plant. Both come from one US government lab report (LBNL 2024).
7. For one typical prompt (0.24 Wh) that is about 1.2 mL, and the range is 0.4 to 2.7 mL.
8. Published per-prompt figures run from 0.12 mL to 45 mL. Scope explains most of the gap.
9. The reader sees teaspoons, as an educational comparison, never as a credit.
10. Water is not scarcity. A liter in a wet place and a dry place count the same here.
11. The owner decided: a US average may stand in for other regions, labeled "US average". The first release holds the rendered water line.

## 1. Is a modeled water estimate defensible?

Yes, with limits. The method is not in dispute. Water is energy times a
water-per-kWh factor, summed over two places. Li et al. (S1) set out this
split, and Google (S2) used the same energy-times-WUE shape in production.

What is in dispute is the size of the inputs. Three facts decide the scope.

**Most of the spread is energy and scope, not water per kWh.** The early
estimate of 16.9 mL for a medium request (S1) used 4 Wh per request. Google's
median prompt is 0.24 Wh (S2). Divide each by its energy:

| Source | Water | Energy | Water per kWh |
|--------|-------|--------|---------------|
| Li et al., GPT-3 case (S1, Table 1, US average, derived) | 16.904 mL | 4 Wh | 4.2 L |
| Google median prompt, on-site only (S2, derived) | 0.26 mL | 0.24 Wh | 1.1 L |
| OpenAI average query, stated by its CEO (S5, derived) | 0.32 mL | 0.34 Wh | 0.9 L |

The water per kWh differs by about 4x. The energy per request differs by
12x to 17x. That is why AiEDs, which already models energy, can add water with
modest extra uncertainty. The energy term stays the larger one.

**Scope explains the rest.** Google counts on-site cooling water only (S2).
Mistral counts the full life cycle, including making the servers, and reports
45 mL for a 400-token reply (S7). That is 375x Google's narrow figure of
0.12 mL (S3). The two are not wrong in the same way. They count different things.

**The grid term is disputed.** Li et al. use 3.1 L/kWh for the US (S1). Siddik
et al. (S13) imply about 5.3 L/kWh, by our own arithmetic from their totals.
LBNL (S14) gives 4.52 L/kWh for US data-center electricity in 2023 and
4.35 L/kWh for US electricity overall. It sits between the two.
We infer, but did not confirm, that the gap comes from how hydropower
evaporation is counted. Li et al. state that hydro withdrawal is normally
excluded (S1). Reservoir hydro can push a grid figure far up: Li et al.
list 9.5 L/kWh for Washington (S1, Table 1).

**Recommendation.** Add water. Do not add it as a single number.

- Scope: inference only, as energy and carbon are today.
- Headline: water consumption, not withdrawal. Consumption is what leaves the
  local source. Google also treats it as the better measure of local impact (S2).
- Show on-site (direct) and power plant (indirect) water apart in the record.
  A rendered view may show the sum.
- Always carry a low and a high figure.
- Confidence is `low` by rule, as the token proxy is.
- Say plainly that it is not a scarcity measure.

The owner decided (2026-10-18) that the first release holds the rendered
water line until the coefficients are checked against the primary text. The
record fields may ship first. See section 2.1.

## 2. The formula

Same shape as sections 2 and 3 of the methodology.

```
siteL  = energyKWh x siteWUE
gridL  = energyKWh x gridWaterIntensity
waterL = siteL + gridL
```

| Term | Meaning | Unit | Default | Low | High |
|------|---------|------|---------|-----|------|
| `energyKWh` | Energy already disclosed by sections 2.1 to 2.4 | kWh | from the path | | |
| `siteWUE` | Water consumed on site for cooling and humidity, per kWh | L/kWh | 0.36 | 0.27 | 1.8 |
| `gridWaterIntensity` | Water consumed to make one kWh of grid power | L/kWh | 4.52 | 1.5 | 9.5 |

Where the defaults come from. The rule: the default is the US-wide value
from the primary source, LBNL 2024 (S14). Everything else is a cross-check or
sets the low and high ends.

- `siteWUE` default 0.36: LBNL 2024, "just over 0.36 L/kWh through 2023", the
  average site WUE across all US data centers (S14, section 4, Figure 4.7,
  report page 48). After 2023 LBNL expects 0.45 to 0.48 L/kWh (same place).
  That is inside our range. A later version may move the default.
- `siteWUE` low 0.27: Microsoft's global WUE for FY25 (S9). Microsoft's page
  does not say if its water is consumed or withdrawn.
  So this is a low bound with a basis caveat.
- `siteWUE` high 1.8: the "typical water cooling requirement" in Siddik et al.
  (S13), a 2018 US study.
- `siteWUE` cross-check 1.15: Google's consumptive fleet WUE, "ISO WUE Category
  2", for 2023 and 2024 (S2). It is an operator figure for one fleet. It is
  higher than the LBNL US average. We keep it as a cross-check and as a
  plausible high-leaning value, not the default.
- `gridWaterIntensity` default 4.52: LBNL 2024, "national average of 4.52
  L/kWh of indirect water consumption" for data-center electricity in 2023
  (S14, section 5, "Indirect Water Consumption and Emissions from Electricity
  Use", report page 57, built on the regional grid mix at US data center
  locations, Figure 5.10). The US electricity overall is 4.35 L/kWh (same
  place). We use the data-center figure because the work runs in data centers.
- `gridWaterIntensity` cross-checks: Li et al. 3.1 L/kWh (S1) and Siddik et al.
  about 5.3 L/kWh (S13, our arithmetic). Neither is the default.
- `gridWaterIntensity` low 1.5 and high 9.5: the Ireland (1.476) and
  Washington (9.501) rows of Li et al. Table 1 (S1). They are single places,
  used here as the ends of the observed spread. To confirm against the paper.

LBNL's own caveat applies: its indirect factors do not reflect power purchase
agreements or on-site generation (S14, report page 57). That fits our
location-based rule below.

Arithmetic cross-check, ours not LBNL's: 66 billion L of direct water over
176 TWh is 0.375 L/kWh of total data-center electricity. LBNL's 800 billion L
of indirect water over 176 TWh is 4.55 L/kWh. Both agree with the stated
0.36 and 4.52 within the rounding of "just over" and "nearly".

Bias note. The new site default (0.36) is below the Google fleet figure
(1.15), so the old habit of choosing the figure that overstates impact no
longer holds for the site term. The grid default (4.52) is above the old
3.1. The total default moves from 4.25 to 4.88 L/kWh. The high end of the
range (11.3 L/kWh) still covers the Google site figure. We chose the primary
US source over the larger operator figure because it is the one with a
government-funded method that covers all US data centers. The owner can
choose otherwise. See open question 1.

Operators report WUE as liters per kWh of IT load (S9). AiEDs energy for some
paths is already scaled by PUE (for example claude at 1.2). LBNL defines WUE
the same way, as water over the IT equipment electricity (S14, section 4,
report page 39). Applying WUE to the disclosed energy slightly overstates site
water on those paths, by at most the PUE. This is the conservative direction.
The final rule text should say it.

Regional path. The default is a US-average grid figure, and the owner decided
(2026-10-18) that it MAY stand in for regions without their own figure, always
labeled "US average". For US regions, the
LBNL Water IMPACT dataset (S15) gives water consumption intensity by grid
balancing authority. It covers 2018 to 2022 on HydroShare, under CC BY. 
For regions outside the US we found no dataset we could verify.
Wattnet (S18) covers Europe. We did not confirm that it publishes factors.
Until there is one, a non-US disclosure uses the default and records
`gridBasis: "default"`. The rendered view says "US average". That is a stated
assumption. It is not a regional figure.

Confidence. `low`, by rule. `med` needs two things. Site water must be metered
at the facility. The grid figure must be for that facility's region and period.
`high` is not defined for water.

Location-based only. The grid term describes the grid that served the work.
The GHG Protocol idea of market-based accounting does not carry over.
A power contract does not change the water a plant evaporated. We did not read the
GHG Protocol definitions on its page (S27), so this is our reasoning, not a
quotation. We define no market-based water figure.

### Worked illustration (the arithmetic behind test vectors V1 and V5)

A median Gemini prompt is 0.24 Wh (S2). Energy is 0.00024 kWh.

- site: 0.00024 x 0.36 = 0.0000864 L = 0.0864 mL
- grid: 0.00024 x 4.52 = 0.0010848 L = 1.0848 mL
- total: 0.0011712 L = 1.1712 mL
- low: 0.00024 x (0.27 + 1.5) = 0.0004248 L = 0.4248 mL
- high: 0.00024 x (1.8 + 9.5) = 0.002712 L = 2.712 mL
- teaspoons: 1.1712 / 5 = 0.23424

Compare Google's own number for the same prompt: 0.26 mL (S2). It is site
water only. Our site term gives 0.0864 mL, about one third of it, because the
LBNL US average (0.36) is about a third of the Google fleet figure (1.15). The
Google figure is a cross-check, and it falls inside our range. With the
Google fleet WUE the site term would be 0.276 mL and the total 1.02 mL.
Google leaves out the grid term and does not say why (S2).

### 2.1 Owner decisions and the LBNL primary source (2026-10-18)

**Decisions.** The owner answered "yes to both":

1. A US-average grid water figure MAY stand in for regions without their own
   figure. It is always labeled "US average".
2. The first release holds back the rendered water line until the
   coefficients are checked against the primary text. The record fields may
   ship. The check stays open until a person signs it off in the publish lane.

**LBNL 2024 (S14) is the primary US source for both coefficients.** The
agent checked each number below against the text of the PDF the owner
supplied (`qt32d6m0d1.pdf`). Page numbers are the printed report pages.

| Number | Where in the report | Used as |
|--------|---------------------|---------|
| Site WUE "just over 0.36 L/kWh through 2023" | Section 4, text above Figure 4.7, page 48 | `siteWUE` default 0.36 |
| Site WUE 0.45 to 0.48 L/kWh after 2023 | Section 4, same paragraph, Figure 4.7, page 48 | note for a later version |
| Direct water, 66 billion L in 2023 (hyperscale and colocation 84%); 21.2 billion L in 2014 | Section 5, "Direct Water Consumption", Figure 5.9, pages 55 and 56 | context, and the 0.375 L/kWh arithmetic check |
| Hyperscale direct water 60 to 124 billion L in 2028 | Section 5, same place, Figure 5.9 | context only |
| Indirect water "nearly 800 billion liters" for 176 TWh in 2023 | Section 5, "Indirect Water Consumption and Emissions from Electricity Use", page 57 | context, and the 4.55 L/kWh arithmetic check |
| Indirect "national average of 4.52 L/kWh", with 0.34 kg/kWh, for data-center electricity | Section 5, same place, page 57 (county map in Figure 5.10) | `gridWaterIntensity` default 4.52 |
| US electricity overall 4.35 L/kWh and 0.35 kg/kWh | Section 5, same place, page 57 | cross-check |
| Data centers used 176 TWh in 2023, 4.4% of US electricity; 325 to 580 TWh in 2028 | Executive summary and section 4 | context |

Two LBNL cautions. WUE (site) and WUE (source) are separate metrics (section 4,
pages 39 and 45). The indirect factors do not include power purchase
agreements or behind-the-meter generation (page 57).

**Which source is the default, which are cross-checks.**

| Role | Source | Use |
|------|--------|-----|
| Default, both terms | LBNL 2024 (S14) | the numbers above |
| Cross-check, site | Google fleet WUE 1.15 (S2) | sanity check, and high-leaning case |
| Cross-check, grid | Li et al. 3.1 (S1), Siddik et al. about 5.3 (S13) | sanity check |
| Range ends | Microsoft 0.27 (S9), Siddik 1.8 (S13), Li et al. Table 1 rows 1.5 and 9.5 (S1) | low and high |

The range logic is unchanged. Low is the sum of the two low ends (1.77 L/kWh).
High is the sum of the two high ends (11.3 L/kWh). The default (4.88 L/kWh)
sits inside both.

**License caveat for LBNL.** The report prints no open license. The U.S.
Government license in the notice is for U.S. Government purposes. So: cite
facts and figures with the full citation in S14, in our own words. Do not
copy its text, tables or charts. Ask LBNL (through
eta-publications.lbl.gov) for a rights check before any table or chart is
copied. The disclaimer says no warranty and no endorsement. Do not suggest
LBNL or the Department of Energy endorse this work.

**Confidence label text.** Water confidence stays `low`. Suggested label:
"Low confidence. Water is a modeled estimate built from US averages for
cooling and for the power grid. It is a range, not a measurement."
For a non-US disclosure add: "Grid water uses a US average."

## 3. How the reader sees it

**Water comparison.** Level 3, like Tree-Time. An educational comparison.
It is never a claim of impact or credit.

- Unit: the teaspoon, 5 mL, as the US food-label rule defines it (S20).
- Formula: `teaspoons = waterL x 1000 / 5`.
- Above 250 teaspoons (1.25 L), show liters.
- A second, optional frame for large totals. The UN says 50 to 100 liters per
  person per day is needed for personal and domestic use (S21).
  Use it only for totals. It needs the same "educational" label.

**Required sentences.** Keep the two that exist. Add a third.

- "Energy and carbon are modeled estimates."
- "Tree-Time and equivalents are educational comparisons."
- "Water is a modeled estimate." (new)

Also recommended: "Water covers cooling at the data center and the power
plants that supply it."

**Words that must not appear about water** (the banned-word list):

```
offset credit neutral positive saved restored replenished
```

The first five come from the brief. We add
"restored" and "replenished". Operators use them in pledges (S4).
A reader may take a pledge as a claim about this disclosure.

**Failure modes to design against:**

1. Huge range. Show the range, or a way to reach it. Never a bare number.
2. Location. The default is a US average. Do not say "in your area".
3. Double counting with the energy mix. Grid water comes from the same
   electricity that carbon comes from. Water and carbon are two views of one
   kWh. Do not add them or net them. Do not present water as a separate impact
   of a separate cause.
4. Scope creep. Training and chip making are out. A reader who has seen 45 mL
   (S7) will ask. The text must say what is left out.
5. Scarcity. A liter is a liter here. Say so.
6. Pledges. Do not set a disclosure beside a "water positive" claim. Those
   claims cover whole companies, not one prompt (S4).

## 4. Document contract (additive, optional)

The top-level schema has `additionalProperties: false`. A new block therefore
needs a schema edit. That is a minor, additive change. A record without the
block stays valid.

Block name: `water`. JSON shape:

```json
"water": {
  "waterL": 0.0011712,
  "siteL": 0.0000864,
  "gridL": 0.0010848,
  "rangeL": { "low": 0.0004248, "high": 0.002712 },
  "basis": "consumption",
  "siteWueLPerKWh": 0.36,
  "gridWaterLPerKWh": 4.52,
  "gridBasis": "default",
  "confidence": "low",
  "comparison": { "unit": "teaspoon", "value": 0.23424 },
  "factorsVersion": "2.5.0-draft"
}
```

Null handling:

- No `energyKWh`: the block is absent. There is no water claim.
- A factor with no source: that term is `null`, and `waterL` is `null`. Never zero.
- `rangeL` is `null` only when `waterL` is `null`.
- `comparison` is `null` when `waterL` is `null`.
- `basis` is always `"consumption"` in this version.
- `gridBasis` is `"default"` or `"region"`. When `"region"`, a `gridRegion`
  string is required.

Conformance rules to add are below. The AiEDs checks today are
`spec/examples/validate.mjs`, the schema, and the `lib/` tests.
There is no separate AiEDs checker package.

| Rule | Check |
|------|-------|
| W1 | `water` requires `energyKWh` in the same record |
| W2 | `waterL` equals `siteL + gridL`, within rounding |
| W3 | `confidence` is `low`, or `med` only with metered site water and a regional grid figure |
| W4 | `rangeL` is present when `waterL` is present, and `low <= waterL <= high` |
| W5 | `basis` equals `"consumption"` |
| W6 | A rendered view with water carries all three required sentences |
| W7 | No word from the banned-word list above appears in water copy |
| W8 | `gridBasis` `"default"` forbids a `gridRegion` claim |
| W9 | No zero or placeholder in place of `null` |
| W10 | A rendered view with `gridBasis` `"default"` labels the grid term "US average" |
| W11 | The first release carries no rendered water line (owner hold, 2026-10-18) until the coefficients are checked against the primary text |

Test vectors below show the arithmetic with the new defaults (site 0.36,
grid 4.52, low 0.27 + 1.5, high 1.8 + 9.5). They are not measurements and must
not be shown to a visitor. A publish lane turns them into tests.

| Vector | Input | Expected |
|--------|-------|----------|
| V1 | energy 0.00024 kWh, defaults | site 0.0000864 L, grid 0.0010848 L, total 0.0011712 L, 0.23424 teaspoons |
| V2 | energy 1 kWh, defaults | site 0.36 L, grid 4.52 L, total 4.88 L, shown in liters (976 teaspoons is over 250) |
| V3 | no energy | no `water` block |
| V4 | energy 0.00024 kWh, grid factor unsourced | `gridL` null, `waterL` null, `rangeL` null |
| V5 | energy 0.00024 kWh, range | low 0.0004248 L (0.00024 x 1.77), high 0.002712 L (0.00024 x 11.3), and low <= total <= high |
| V6 | energy 1 kWh, range | low 1.77 L, high 11.3 L |
| V7 | non-US work, no regional figure | grid term 4.52, `gridBasis` "default", view labels it "US average" |

Code work is out of scope for this lane. A publish lane would touch
`spec/methodology.md` (new section 2.6, Table 5, changelog),
`spec/v2/aieds-factors.json`, `spec/aieds.schema.json`, `lib/src/`,
`mcp/src/factors.ts`, and the tests. CONTRIBUTING requires the methodology,
`mcp/src/factors.ts` and the changelog to change together, and the `lib/`
parity fixture to stay green.

## 5. Impact on the products

- **AiEDs receipt line.** Water belongs here, after energy and carbon, with the
  range one tap away. This is the natural home.
- **EQ report.** Water belongs, as a modeled line with the range. We did not
  read the EQ report spec in this lane, so the exact line is to confirm.
- **E+ personal panel.** The owner decision was that it shows energy and
  carbon only. We recommend water stays out of it. A personal view invites
  "my water" and "your area" readings that a US-average default cannot support.
- **Follow-on lanes and repos:**
  1. `standard`: the publish lane (methodology, factors JSON, schema, lib, mcp,
     tests, site, changelog, version number).
  2. `rk_ai`: parity with the new factors (the response-surface code mirrors
     `ai_impact.dart` per the methodology).
  3. `ruok`: the receipt line and copy, behind the required sentences.
  4. `xyz`: the docs site page for the new section.
  5. `standard`, later: a regional table once a non-US source is cleared.

## 6. What the research did not settle

- Water per kWh for Anthropic, Meta and xAI models. We found no per-prompt
  water figure from them in this pass. A search summary said so for Anthropic,
  Meta and xAI. We did not confirm it on a primary page.
- Audit status. Google says its figures were not verified by a third party
  (S3). Mistral says two audit firms peer reviewed its study (S7).
  OpenAI's figure has no published method that we found (S5). No operator
  water figure that we read says it is externally assured.
- Embodied water, training water, and scarcity weighting. All out of scope.
  The Green Software Foundation is drafting a Software Water Intensity
  standard. It is pre-draft, with no formula (S28).
- Two documents could not be read as text here.
  They are the Microsoft 2026 fact sheet (S10) and the Meta 2025 data index
  (S12). Their figures are not used. The one low bound comes from the
  Microsoft efficiency page (S9). The LBNL 2024 report (S14) was read from the
  PDF the owner supplied, and the figures are in section 2.1.

## 7. Source table

Check date for every row: 2026-10-18. Verdicts: usable now, with conditions,
not usable, to confirm. "Read" means the fetch tool returned the page text.
The fetch tool summarizes pages with a small model. Treat every figure as
"read via summary" until checked against the page by a person.

| ID | Source | URL | License or terms | Verdict |
|----|--------|-----|------------------|---------|
| S1 | Li, Yang, Islam, Ren. Making AI Less Thirsty, arXiv v5, 26 Mar 2025 | https://arxiv.org/html/2304.03271v5 | Not read. | with conditions: now a cross-check and the source of the low and high grid ends; license and upstream source of 3.1 to confirm |
| S2 | Elsworth et al. Measuring the environmental impact of delivering AI at Google Scale, arXiv 2508.15734, 21 Aug 2025 | https://arxiv.org/abs/2508.15734 | CC BY 4.0 (read on page) | usable now: the 0.24 Wh median prompt, and the 1.15 L/kWh fleet WUE as a cross-check |
| S3 | Google Cloud blog, Measuring the environmental impact of AI inference, 21 Aug 2025 | https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference | Not read. States figures are not independently verified. | with conditions: cite figures only |
| S4 | Google 2026 Environmental Report page | https://sustainability.google/google-2026-environmental-report/ | Not read. | not usable: no WUE, no data-center water total, no assurance statement on the page |
| S5 | Sam Altman, The Gentle Singularity (0.34 Wh, 0.000085 gallons). Page showed no date. | https://blog.samaltman.com/the-gentle-singularity | Not read. | with conditions: blog-grade, no method, date to confirm |
| S6 | Tom's Hardware report of an Altman almond remark, undated on page | https://www.tomshardware.com/tech-industry/data-centers/openai-ceo-sam-altman-says-38-000-chatgpt-queries-use-as-much-water-as-the-production-of-one-almond-says-data-centers-use-no-more-water-than-an-office-building | Not read. | not usable: secondary, no date, no method |
| S7 | Mistral, 22 Jul 2025, lifecycle analysis (45 mL per 400-token reply) | https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai | Not read. | with conditions: full life cycle scope; consumption or withdrawal not stated |
| S8 | Jegham et al. How Hungry is AI, arXiv 2505.09598, v6 24 Nov 2025 | https://arxiv.org/abs/2505.09598 | CC BY 4.0 (read on page) | with conditions: the page gave no per-query water figure; method uses operator multipliers |
| S9 | Microsoft datacenter efficiency page (WUE 0.30 FY24, 0.27 FY25) | https://datacenters.microsoft.com/sustainability/efficiency/ | Not read. | with conditions: consumed or withdrawn not stated |
| S10 | Microsoft 2026 Environmental Data Fact Sheet (PDF) | https://aka.ms/SustainabilityFactsheet2026 | Not read. | to confirm: PDF text could not be read |
| S11 | AWS sustainability page (WUE 0.12 L/kWh withdrawn, 2025) | https://aws.amazon.com/sustainability/ | Not read. | with conditions: withdrawal basis, so it sets no consumption bound |
| S12 | Meta 2025 Environmental Data Index (PDF) | https://sustainability.atmeta.com/wp-content/uploads/2025/10/Meta_2025-Environmental-Data-Index.pdf | Not read. | to confirm: PDF text could not be read. A search summary said 0.19 for 2024. |
| S13 | Siddik, Shehabi, Marston. Environmental footprint of data centers in the US, ERL 16, 2021 | https://iopscience.iop.org/article/10.1088/1748-9326/abfba1 | CC BY 4.0 (read on page) | usable now |
| S14 | Shehabi, A., Smith, S.J., Hubbard, A., Newkirk, A., Lei, N., Siddik, M.A.B., Holecek, B., Koomey, J., Masanet, E., Sartor, D. 2024. 2024 United States Data Center Energy Usage Report. Lawrence Berkeley National Laboratory, Berkeley, California. LBNL-2001637. DOI 10.71468/P1WC7Q. Published 19 Dec 2024. | https://escholarship.org/uc/item/32d6m0d1 | Read in the PDF by the owner and checked by the agent. DOE Contract No. DE-AC02-05CH11231; the U.S. Government keeps a license for U.S. Government purposes. No Creative Commons or other open license is printed. | with conditions: PRIMARY US source for both default coefficients. Cite facts with the full citation. Do not copy its text, tables or figures. Rights check with LBNL before copying any table or chart. |
| S15 | LBNL Water IMPACT tool; HydroShare dataset, Siddik, Shehabi, Rao, Marston | http://www.hydroshare.org/resource/2f54448714554f83b9655da108f0fd3f | The HydroShare page states CC BY. The tool page states no license. | usable now for US regions: take the data from HydroShare, years 2018 to 2022 |
| S16 | NREL operational water factors dataset (Macknick et al.) | https://catalog.data.gov/dataset/operational-water-consumption-and-withdrawal-factors-for-electricity-generating-technologi | CC BY 4.0 per Data.gov listing | usable now as a method cross-check; values from 2011 literature, US only |
| S17 | Macknick et al., ERL 7, 045802, 2012 (article PDF) | https://openei.org/datasets/files/969/pub/1748-9326_7_4_045802.pdf | Links in the file point to CC BY-NC-SA 3.0 | not usable: non-commercial term |
| S18 | Wattnet, arXiv 2601.11623, v3 18 Sep 2026 | https://arxiv.org/abs/2601.11623 | CC BY 4.0 (read on page) | to confirm: did not confirm a published table of country factors |
| S19 | Koomey, fleet-average on-site water for top 20 operators | https://www.koomey.com/koomey_blog/reviewing-fleet-average-onsite-water-and-infrastructure-energy-efficiency-for-the-top-twenty-global-data-center-operators/ | Not read. | to confirm: the fetch tool was blocked |
| S20 | 21 CFR 101.9, teaspoon is 5 mL, paragraph (b)(5)(viii) | https://www.law.cornell.edu/cfr/text/21/101.9 | Not read. A unit definition. | usable now as a unit definition |
| S21 | UN, Water: 50 to 100 liters per person per day | https://www.un.org/en/global-issues/water | Terms page text not read. | with conditions: cite the figure, do not copy text |
| S22 | WHO, Domestic water quantity, service level and health, 2nd ed., 23 Dec 2020 | https://www.who.int/publications/i/item/9789240015241 | CC BY-NC-SA 3.0 IGO (read on page) | not usable: non-commercial term; page gave no volumes |
| S23 | OHCHR Fact Sheet 35 | https://www.ohchr.org/sites/default/files/Documents/Publications/FactSheet35en.pdf | Not read. | to confirm: PDF text could not be read |
| S24 | Water Footprint Network glossary (consumption, withdrawal, blue water) | https://www.waterfootprint.org/water-footprint-2/glossary/ | No license on page. Asks for citation of Hoekstra et al. (2011). | with conditions: cite the definitions with that citation |
| S25 | ISO 14046:2014 Water footprint | https://www.iso.org/standard/43263.html | Paid standard. The page returned 403. | to confirm: not read |
| S26 | ISO/IEC 30134-9 WUE (BSI listing) | https://knowledge.bsigroup.com/products/information-technology-data-centres-key-performance-indicators-water-usage-effectiveness-wue | Paid standard. | to confirm: the listing says BS ISO/IEC 30134-9:2022 was withdrawn 8 Aug 2022; why and what replaced it is unread |
| S27 | GHG Protocol Scope 2 Guidance page | https://ghgprotocol.org/scope-2-guidance | Terms not read. | to confirm: the page did not define location-based or market-based |
| S28 | Green Software Foundation, Software Water Intensity | https://greensoftware.foundation/standards/swi/ | All rights reserved | not usable: pre-draft, no formula. Watch it. |
| S29 | Green Software Foundation, Software Water Handbook, approved, launched 30 Jul 2026 | https://directory.greensoftware.foundation/projects/software-water-handbook/ | Not stated on the page | to confirm: license is in its GitHub repo, unread |

Verdict counts for the 29 sources (S14 moved from "to confirm" to "with
conditions" on 2026-10-18):

- usable now: 5 (S2, S13, S15, S16, S20)
- with conditions: 10 (S1, S3, S5, S7, S8, S9, S11, S14, S21, S24)
- not usable: 5 (S4, S6, S17, S22, S28)
- to confirm: 9 (S10, S12, S18, S19, S23, S25, S26, S27, S29)

Total 29.

Known discrepancy in a source. The Google paper's Table 2 gives 0.12 mL for the
narrow method. Its section 4.2 gives 0.15 mL (S2, as read through the fetch
tool). The Google blog gives 0.12 mL (S3). To confirm.

## 8. Open questions for the owner (4)

Answered on 2026-10-18 and removed: US-average default for all regions (yes,
labeled "US average"); hold the rendered line in the first release (yes);
re-check the coefficients against the primary text (done against the LBNL PDF
text by the agent; the hold stays until a person signs off in the publish lane).

Still open, in order:

1. Do you accept the LBNL values as the defaults (0.36 and 4.52), knowing the site default is now below the Google fleet figure (1.15)? The alternative is to keep 1.15 as the default and use LBNL as the cross-check.
2. Do you want LBNL asked for a rights check now, so tables or charts could be used later? Facts with a citation need no grant.
3. Should the receipt show direct and indirect apart, or only the sum?
4. Should the banned-word list also ban "water positive" and "replenish" in any AiEDs-adjacent copy?

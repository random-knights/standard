# PROPOSAL (DRAFT): a modeled water estimate for AiEDs

**Status:** DRAFT proposal. Not ratified. No normative change.
**Lane:** standard--aieds-water-1018
**Date:** 2026-10-18 (every source below was checked on this date)
**Implies:** AiEDs 2.5.0 (draft number; the owner assigns the final number at publish)
**Companion:** `ai-water-DRAFT.md` in this folder holds the proposed rule text.
**Folder note:** the repo had no `docs/proposals/` folder and no drafts
convention. This folder is new. `docs/` holds only one file today.

## Summary (10 lines)

1. The owner asked if research on Ai water use is good enough to add a water estimate.
2. Yes, if it is shown as a range, with low confidence, and for inference only.
3. Ai uses water in two places: to cool the data center, and to make the electricity.
4. We would count water consumed (gone from the local source), not water withdrawn.
5. The formula is the same shape as carbon: energy times a water factor.
6. Default factor: 1.15 L per kWh on site, plus 3.1 L per kWh at the power plant.
7. For one typical prompt (0.24 Wh) that is about 1 mL, and the range is 0.4 to 2.7 mL.
8. Published per-prompt figures run from 0.12 mL to 45 mL. Scope explains most of the gap.
9. The reader sees teaspoons, as an educational comparison, never as a credit.
10. Water is not scarcity. A liter in a wet place and a dry place count the same here.

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

If the owner wants a smaller step, ship the record fields first.
Keep the water line out of the rendered receipt. See open question 4.

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
| `siteWUE` | Water consumed on site for cooling and humidity, per kWh | L/kWh | 1.15 | 0.27 | 1.8 |
| `gridWaterIntensity` | Water consumed to make one kWh of grid power | L/kWh | 3.1 | 1.5 | 9.5 |

Where the defaults come from:

- `siteWUE` default 1.15: Google's consumptive fleet WUE, "ISO WUE Category 2",
  for 2023 and 2024 (S2). It is the only operator figure we read that is on a
  consumption basis. It is also published with its method in a CC BY paper.
- `siteWUE` low 0.27: Microsoft's global WUE for FY25 (S9). Microsoft's page
  does not say if its water is consumed or withdrawn.
  So this is a low bound with a basis caveat.
- `siteWUE` high 1.8: the "typical water cooling requirement" in Siddik et al.
  (S13), a 2018 US study.
- `gridWaterIntensity` default 3.1: the US average consumption figure in Li et
  al. (S1). The paper's own upstream source for it was not read. To confirm.
- `gridWaterIntensity` low 1.5 and high 9.5: the Ireland (1.476) and
  Washington (9.501) rows of Li et al. Table 1 (S1). They are single places,
  used here as the ends of the observed spread. To confirm against the paper.

Bias note. AiEDs already chooses the figure that overstates impact when it
must choose (section 2.5.1 and section 2.1). The default site WUE of 1.15 is
above the Microsoft (S9) fleet figure, and above the AWS (S11) figure. That is
the same direction. The AWS figure is a withdrawal figure, so it sets no bound.

Operators report WUE as liters per kWh of IT load (S9). AiEDs energy for some
paths is already scaled by PUE (for example claude at 1.2). Applying WUE to the
disclosed energy slightly overstates site water on those paths, by at most the
PUE. This is the conservative direction. The final rule text should say it.

Regional path. The default is a US-average grid figure. For US regions, the
LBNL Water IMPACT dataset (S15) gives water consumption intensity by grid
balancing authority. It covers 2018 to 2022 on HydroShare, under CC BY. 
For regions outside the US we found no dataset we could verify.
Wattnet (S18) covers Europe. We did not confirm that it publishes factors.
Until there is one, a non-US disclosure uses the default and records
`gridBasis: "default"`. That is a stated assumption. It is not a regional
figure. See open question 2.

Confidence. `low`, by rule. `med` needs two things. Site water must be metered
at the facility. The grid figure must be for that facility's region and period.
`high` is not defined for water.

Location-based only. The grid term describes the grid that served the work.
The GHG Protocol idea of market-based accounting does not carry over.
A power contract does not change the water a plant evaporated. We did not read the
GHG Protocol definitions on its page (S27), so this is our reasoning, not a
quotation. We define no market-based water figure.

### Worked illustration (not a test vector)

A median Gemini prompt is 0.24 Wh (S2). Energy is 0.00024 kWh.

- site: 0.00024 x 1.15 = 0.000276 L = 0.276 mL
- grid: 0.00024 x 3.1 = 0.000744 L = 0.744 mL
- total: 1.02 mL, range 0.42 to 2.71 mL

Compare Google's own number for the same prompt: 0.26 mL (S2). It is site
water only, and our site term gives 0.276 mL. They agree. The extra comes
from the grid term, which Google leaves out. Google does not say why (S2).

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
  "waterL": 0.00102,
  "siteL": 0.000276,
  "gridL": 0.000744,
  "rangeL": { "low": 0.000425, "high": 0.002712 },
  "basis": "consumption",
  "siteWueLPerKWh": 1.15,
  "gridWaterLPerKWh": 3.1,
  "gridBasis": "default",
  "confidence": "low",
  "comparison": { "unit": "teaspoon", "value": 0.204 },
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

Test vectors below are ILLUSTRATIVE only. They show the arithmetic. They are
not measurements and must not be shown to a visitor.

| Vector | Input | Expected |
|--------|-------|----------|
| V1 | energy 0.00024 kWh, defaults | site 0.000276 L, grid 0.000744 L, total 0.00102 L, 0.204 teaspoons |
| V2 | energy 1 kWh, defaults | total 4.25 L, shown in liters (850 teaspoons is over 250) |
| V3 | no energy | no `water` block |
| V4 | energy 0.00024 kWh, grid factor unsourced | `gridL` null, `waterL` null, `rangeL` null |

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
- Three documents could not be read as text here.
  They are the LBNL 2024 report (S14), the Microsoft 2026 fact sheet (S10),
  and the Meta 2025 data index (S12).
  Their figures are not used. The one low bound comes from the Microsoft
  efficiency page (S9).

## 7. Source table

Check date for every row: 2026-10-18. Verdicts: usable now, with conditions,
not usable, to confirm. "Read" means the fetch tool returned the page text.
The fetch tool summarizes pages with a small model. Treat every figure as
"read via summary" until checked against the page by a person.

| ID | Source | URL | License or terms | Verdict |
|----|--------|-----|------------------|---------|
| S1 | Li, Yang, Islam, Ren. Making AI Less Thirsty, arXiv v5, 26 Mar 2025 | https://arxiv.org/html/2304.03271v5 | Not read. | with conditions: cite the method and the US figure; license and upstream source of 3.1 to confirm |
| S2 | Elsworth et al. Measuring the environmental impact of delivering AI at Google Scale, arXiv 2508.15734, 21 Aug 2025 | https://arxiv.org/abs/2508.15734 | CC BY 4.0 (read on page) | usable now |
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
| S14 | LBNL 2024 United States Data Center Energy Usage Report, 19 Dec 2024 | https://eta-publications.lbl.gov/publications/2024-lbnl-data-center-energy-usage-report | The page states no license. | to confirm: water figures not read |
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

Verdict counts for the 29 sources:

- usable now: 5 (S2, S13, S15, S16, S20)
- with conditions: 9 (S1, S3, S5, S7, S8, S9, S11, S21, S24)
- not usable: 5 (S4, S6, S17, S22, S28)
- to confirm: 10 (S10, S12, S14, S18, S19, S23, S25, S26, S27, S29)

Known discrepancy in a source. The Google paper's Table 2 gives 0.12 mL for the
narrow method. Its section 4.2 gives 0.15 mL (S2, as read through the fetch
tool). The Google blog gives 0.12 mL (S3). To confirm.

## 8. Open questions for the owner (6)

1. Do you accept a US-average grid default of 3.1 L/kWh for all regions until a non-US source is cleared?
2. Should a non-US disclosure show water at all, or show "no reading" for the grid term?
3. Should the receipt show direct and indirect apart, or only the sum?
4. Should the first release hold the rendered line until the range view exists?
5. Should the banned-word list also ban "water positive" and "replenish" in any AiEDs-adjacent copy?
6. Do you want the two coefficients re-checked against the primary PDFs by a person before this goes to ratification?

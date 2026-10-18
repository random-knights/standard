# Proposal: option B, a cited baseline for scale

**Status:** DRAFT research for owner review. Nothing here is ratified.
**Written and checked:** 2026-10-18 (lane `standard--eplus-ai-context-1018`)
**Companion files:** `eplus/PROPOSAL-ai-footprint-context.md` and
`eplus/drafts/ai-footprint-context-DRAFT.md`
**Changes no version.** This file is in no site build and no package.

## Summary in ten lines

1. Option B shows the reader's modeled Ai energy next to a cited baseline, so
   "1.84 kWh" has a size a person can feel.
2. It helps. A bare number means little. A number beside a household or a
   person's yearly electricity use means something.
3. It also misleads easily. A tiny share reads as "nothing to worry about". A
   mismatched baseline can inflate or shrink it. Years and methods can be mixed.
4. My recommendation: do B, but only as a **scale line for energy**, in the
   reader's own region, with the baseline name, year and license beside it.
5. Show a scale bar and the two raw numbers. Do not lead with a percent.
6. Carbon gets no baseline in the first step. The grid factor already comes
   from AiEDs, and carbon baselines carry the most accounting traps.
7. Tree-Time stays out (owner decision 4). No credit or balance wording.
8. I checked 14 sources on their own pages. Verdicts: 1 usable now, 7 usable
   with conditions, 1 not usable, 5 to confirm.
9. First baseline to try: **Ember yearly electricity data** (CC BY 4.0, read
   on Ember's own pages). One condition: I did not open the data file, so the
   per-person demand field must be confirmed before anyone builds on it.
10. Two big sources could not be read at all (IEA, Electricity Maps). They stay
    "to confirm". Nothing was filled from memory.

Check date for every source below: **2026-10-18**. The fetch tool returns a
summary of each page. Quotes in this file are copied from that returned text
and are under 15 words. Where a page returned an error, the row says what I
tried.

## a. What B adds and what it risks

### What B adds

A reader's monthly modeled Ai energy is a small number in a unit most people
never use. A baseline gives it a size.

These are **test vectors**. They show the arithmetic. They are not data about
any reader.

| Test vector | Value |
| --- | --- |
| Reader's modeled Ai energy, one month | 1.84 kWh |
| Baseline: average US home, one month (EIA, 2022) | about 899 kWh |
| Share | 1.84 / 899 = 0.20 percent |
| Carbon at the AiEDs Table 3 global average (436 g/kWh) | 1.84 x 436 = about 802 g CO2e |

The 899 kWh figure is read from the EIA page checked below. The EIA page calls
it electricity purchased by the average residential customer, not total
household use. The 436 value is the AiEDs `global_average` in
`spec/methodology.md`.

Context for scale, from pages I read: data centers used about 4.4 percent of
US electricity in 2023 (Berkeley Lab, via its own news page). The IEA gave
about 1.5 percent of world electricity in 2024 (415 TWh), but I only saw that
through a search result, not the IEA page. Treat the IEA number as "to confirm".

### How it can mislead

1. **A tiny share reads as "fine".** 0.20 percent is a true number. A reader may
   hear "so it does not matter". That is a claim too, and the standard makes
   neither claim. The text states the numbers and does not call them small.
2. **A mismatched baseline.** A per-person baseline against a household
   baseline changes the share by the household size. A world baseline against a
   local grid does the same.
3. **Mixed years.** A 2024 reading against a 2019 baseline mixes a different
   world. The baseline year is always shown.
4. **Mixed accounting.** Production-based carbon (what a country emits) and
   consumption-based carbon (what a country's people cause, trade included) are
   different quantities. GCP publishes both. Never set one against the other.
   The same trap exists in the grid method: location-based and market-based
   (see the GHG Protocol row below). AiEDs uses a grid average, which is a
   location-based idea. The baseline must use the same idea.
5. **Per person against per household.** Both exist. Pick one per baseline and
   say which.
6. **Purchases against use.** EIA says utility purchases can understate use
   where homes have rooftop solar. The baseline must say what it counts.
7. **Causal slide.** "Your use is 0.2 percent of a home" can drift into "your
   use is part of the cause". Co-location is not causation. The E+ block
   never says it.

### Design rules that keep B honest

1. Always show the baseline name, the region, the year, the unit and the
   license name beside the number.
2. Show a scale bar with both raw numbers on it. A percent alone is not enough.
   The bar is drawn to true scale, so a tiny reader value looks tiny, not
   rounded up to a visible sliver without a label saying so.
3. No causal wording. No "because of you", no "your use moved". The banned list
   in draft 12.8 applies as written. The `noCause` sentence stays.
4. Same confidence label as the footprint. A baseline never raises it.
5. The sentence "Tree-Time and equivalents are educational comparisons." stays
   on the panel, because a baseline comparison is an equivalent.
6. No credit, balance or compensation language. The only use of "offset" is the
   narrow third-party-name exception in draft 12.8.
7. One baseline per figure, one year, one unit. If the year or region is
   missing, show "no reading" for the comparison, not a guess.
8. The baseline never enters the Earth Health Score. `blendedIntoScore` stays
   `false`.
9. The data-center share is context for the world, not for the reader. It sits
   in a separate line and is never divided into the reader's number.

### Recommended form

**Do B, in this form only.**

- **Panel:** one extra line under the energy figure in the "Your modeled Ai
  footprint" panel. It is a scale line, not a third panel.
- **Numbers:** the reader's energy for the period, the baseline in the same
  unit and for the same length of time, and the baseline's year. A scale bar
  between them, drawn to scale. The percent may appear as small text under the
  bar, never as the headline.
- **Energy only.** No carbon baseline in the first step.
- **Fields:** the draft's `baseline` field changes from `null` to an object with
  `name`, `publisher`, `datasetVersion`, `year`, `region`, `unit`, `basis`
  (`per-person` or `per-household`), `licenseName`, `sourceUrl` and `value`.
  `mode` becomes `"proportion"`. Check 18 changes so a ratio is allowed only
  when `baseline` is complete.
- **Missing baseline:** the line says "no baseline for this region" and the
  panel still works as option A.

I would not recommend B if no baseline could be cleared. One can (below), so B
is worth trying. The risks are real, and the design rules are the answer to
them.

## b. Outside sources

Verdict key. **Usable now:** license read, no extra condition beyond credit.
**Conditions:** usable if the stated conditions are met. **Not usable:** the
terms I read forbid the use. **To confirm:** I could not read the terms, or
they were ambiguous.

### Data and context sources

| # | Source (dataset, publisher) and URL | Gives | Coverage, cadence | License as read (page) | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | Ember, Yearly Electricity Data. https://ember-energy.org/data/yearly-electricity-data/ | generation, capacity, emissions, carbon intensity, demand and imports by source | over 200 geographies. Year range not shown on the page. "Updated monthly" in the header, twice a month in the summary | CC BY 4.0. Footer: "All content is released under a Creative Commons Attribution Licence (CC-BY-4.0)." Ember's page https://ember-energy.org/creative-commons/ adds: share and adapt with credit, ask permission for the logo, no third-party exception listed. Commercial use is not stated on the page but is part of CC BY 4.0 itself | Conditions: the page does not name a per-person demand field or the latest year. Open the CSV and confirm before building. Credit Ember and link the dataset |
| 2 | Ember, Monthly Electricity Data. https://ember-energy.org/data/monthly-electricity-data/ | monthly generation, emissions, carbon intensity (gCO2e/kWh), demand row | 88 geographies (the meta text says 85), "more than 90%" of world power demand. Updated twice a month | Same CC BY 4.0 footer as row 1. The page does not state a separate dataset license | Conditions: same as row 1. Monthly data suits a later "same month" baseline |
| 3 | Our World in Data, Energy data and per-person electricity charts. https://ourworldindata.org/grapher/per-capita-electricity-generation and https://github.com/owid/energy-data | per-person electricity generation and, since 2024, per-person demand from Ember | Chart: 1900 to 2025, last updated 2026-06-30, next June 2027. Data repo: irregular updates, last 2026-04-27 | https://ourworldindata.org/faqs : data produced by OWID is under CC BY 4.0, and "Unless otherwise stated, you can use, reproduce, and distribute any chart we made". Most data is third-party and keeps its own license. The repo page says third-party data keeps its original license. The chart cites Ember, the Energy Institute and others | Conditions: credit OWID and the original provider. The Energy Institute Statistical Review has its own terms that I did not read, so use only the Ember-derived fields |
| 4 | World Bank, Electric power consumption (kWh per capita), EG.USE.ELEC.KH.PC. https://data.worldbank.org/indicator/EG.USE.ELEC.KH.PC | kWh per person by country | 1990 to 2025 in the year selector. The latest-year table was empty on the page | Page shows CC BY-4.0. https://datacatalog.worldbank.org/public-licenses : open datasets are CC BY 4.0, credit required, indicate changes. Exceptions exist for third-party data | Conditions: the page names the IEA as the source. I could not read the IEA's current terms (row 10), so the pass-through is unclear. Do not use until row 10 is confirmed |
| 5 | US EIA, electricity sales and revenue (EIA-861) and the household-use FAQ. https://www.eia.gov/electricity/sales_revenue_price/ and https://www.eia.gov/tools/faqs/faq.php?id=97&t=3 | US residential sales, customers and price by state. FAQ: average customer bought 10,791 kWh in 2022 (about 899 kWh a month), highest Louisiana 14,774, lowest Hawaii 6,178 | US and states. Annual. The 2024 edition is the latest on the page. The summary product is discontinued and the EIA-861 files carry the data | https://www.eia.gov/about/copyrights_reuse.php : "U.S. government publications are in the public domain and are not subject to copyright protection." EIA asks for the form "Source: U.S. Energy Information Administration (Oct 2008)." Logos and third-party photos are excluded | Usable now (US only). Cite the EIA with the publication date |
| 6 | US EPA, eGRID. https://www.epa.gov/egrid and https://www.epa.gov/egrid/download-data | emission rates, generation and resource mix by US subregion and plant | Edition with 2023 data, released 2025-01-15, revisions 2025-01-17 and 2025-06-12. Cadence not stated on the pages | The eGRID pages state no reuse terms. https://www.epa.gov/web-policies-and-procedures/epa-disclaimers says documents "may be freely distributed and used for non-commercial, scientific and educational purposes" and individual documents may differ | To confirm: no data-specific license was found. Ask EPA, or find a data statement on the eGRID summary page, which I did not read |
| 7 | European Environment Agency, GHG emission intensity of electricity generation. https://www.eea.europa.eu/en/analysis/indicators/greenhouse-gas-emission-intensity-of-1 | gCO2e/kWh by country, EU | 1990 to 2024. Published 2026-07-10. Once a year | https://www.eea.europa.eu/en/legal-notice : materials are under CC BY 4.0, commercial use allowed, EEA must be credited, meaning must be kept, third-party material excluded, "Some data carries its own conditions". The indicator page itself states none | Conditions: credit the EEA, keep the meaning, check the item for its own conditions. Carbon, so not used in the first step |
| 8 | Eurostat, energy statistics. https://ec.europa.eu/eurostat/web/main/help/copyright-notice | household electricity use and other EU series | EU, EFTA, candidates. Annual and monthly series vary by table | Data reuse under Commission Decision 2011/833 "provided the source is acknowledged". Editorial text is CC BY 4.0. Dataset credit form: "Source: [DOI of the dataset], [access date]." Some non-EU data is non-commercial only | Conditions: use only EU and EFTA tables, cite with DOI and access date. I did not pick a specific table |
| 9 | Electricity Maps, data and API. https://help.electricitymaps.com/en/articles/11750446-terms-of-service and .../11513934-terms-of-use | live and historical grid carbon intensity | worldwide, real time and history | The pages returned HTTP 403 to my fetch tool, and the old addresses redirect to them. A web search summary of them says external commercial use is restricted, the API license is for internal non-commercial needs, and historical data on the Data Portal is under the ODbL. I did not read the text | To confirm, and likely not usable for a published standard. Evidence is a search summary only. Tried: direct fetch of both help pages (403), the old terms addresses (redirects to the same pages) |
| 10 | IEA, Energy and AI (report and data), and IEA terms. https://www.iea.org/reports/energy-and-ai and https://www.iea.org/terms | data-center electricity, 2024 level and projections to 2030 | global and regional, 2024 base | Every iea.org page returned HTTP 403 (a Cloudflare check) to my fetch tool and to curl. I did not try to bypass it. I did read the IEA's older notice for CC-licensed content (PDF dated 2022-04-14 in its metadata): credit "IEA 202[X]; [Title name], [URL], License", a derived-work disclaimer is required, no IEA logo on derived material, and third-party parts are not licensed. A search summary says text and standalone graphs are generally CC BY 4.0 with exceptions, and that data points have separate non-CC terms. The brief says the license changed, and I could not see the current text | To confirm. Do not use IEA numbers in the standard until the current terms are read by a person. Note: AiEDs Table 3 `global_average` (436) cites IEA 2023, so this also touches the existing AiEDs source |
| 11 | Berkeley Lab, 2024 Report on U.S. Data Center Energy Use. https://energyanalysis.lbl.gov/news/berkeley-lab-report-evaluates-increase-electricity-demand-data-centers | US data-center electricity: 58 TWh (2014), 176 TWh (2023), 4.4 percent of US electricity (2023), 325 to 580 TWh and 6.7 to 12 percent by 2028 | US, 2014 to 2028. One-off report, December 2024 | The news page and the DOE page state no license. The lab's disclaimers page only points to a reproduction-request form. The report PDF address redirects to https://escholarship.org/uc/item/32d6m0d1, which returned no readable content | To confirm. Citing a public fact with attribution is low risk. Copying text or charts needs a person to read the report's own rights notice |
| 12 | EDGAR, JRC. https://edgar.jrc.ec.europa.eu/ and https://edgar.jrc.ec.europa.eu/dataset_ghg2026 | national and gridded GHG emissions | over 220 countries, 1970 to 2025, edition 2026 published 2026-09-24 | Dataset page: EU-owned material is "licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence", credit and mark changes. Cite as "EDGAR_2026_GHG", Joint Research Centre | Conditions for EU-owned parts. Carbon, so not used in the first step |
| 13 | EDGAR, IEA-EDGAR CO2 (v5) fossil CO2, same page as row 12 | fossil CO2 by country | as row 12 | Same page: "licensed under CC BY-NC-ND 4.0". Contact compliance@iea.org for other uses | Not usable (no commercial use, no derivatives, so no derived charts) |
| 14 | Global Carbon Project, Global Carbon Budget 2025 data. https://globalcarbonbudget.org/data-hub/the-latest-gcb-data-2025/ | national fossil CO2 and land-use CO2 (spreadsheets) | edition 2025. Yearly | The data hub names no license. It says the data "are freely available" and asks you to cite Friedlingstein et al., 2025, and to acknowledge the Global Carbon Project. A search summary says the paper is open access under CC BY. The page did not say whether the files are territorial or consumption-based | To confirm: no data license text. Dataset DOI landing page (https://doi.org/10.18160/GCP-2025) not opened |

**Counts:** usable now 1 (row 5). Conditions 7 (rows 1, 2, 3, 4, 7, 8, 12).
Not usable 1 (row 13). To confirm 5 (rows 6, 9, 10, 11, 14).

Note: row 4 is marked "conditions" because the page shows CC BY-4.0, but my
advice there is to hold it until row 10 is read.

### Outside guidance on honest presentation and Ai measurement

| Source and URL | What to borrow | What to avoid | License for reuse |
| --- | --- | --- | --- |
| GHG Protocol, Scope 2 Guidance (2015 PDF, https://ghgprotocol.org/sites/default/files/standards/Scope%202%20Guidance_Final_Sept26.pdf ) | The idea of two labeled methods. Text read: a location-based method reflects "average emissions intensity of grids on which energy consumption occurs" and a market-based method reflects chosen electricity. Companies with contractual instruments must report both and label each (dual reporting). Say which method a figure uses | Copying its text. Using a market-based figure beside a location-based baseline | The PDF's own notice: Creative Commons Attribution-NonCommercial-NoDerivative Works 3.0. So cite and paraphrase the idea. Do not copy text. https://ghgprotocol.org/terms-use limits other reuse, with two named publications under CC BY 4.0 |
| Green Software Foundation, Software Carbon Intensity (SCI). https://sci.greensoftware.foundation/ and https://github.com/Green-Software-Foundation/sci | A per-unit intensity rate. Version 1.1.0. Formula as read: SCI = (O + M) per R. Grid intensity excludes market-based measures | Treating SCI as a total for a person. It is a rate per functional unit | Page text shows a 2024 copyright notice and no license. The GitHub page lists both CC BY 4.0 and MIT for the group's projects and does not say which covers the spec. To confirm before copying text. Concepts are free to cite |
| ISO/IEC 21031:2024 (SCI as an ISO standard). The GitHub page links to https://www.iso.org/standard/86612.html | The same rate idea | Quoting paid ISO text | ISO page returned 403. To confirm. ISO standards are sold, so assume no reuse of text |
| ISO/IEC TR 20226:2025, Environmental sustainability aspects of AI systems. https://www.iso.org/standard/86177.html | A map of what an Ai footprint can include: workload, resources, carbon impact, location | Treating it as a rule. It is a technical report, not a normative standard | Seen only through a search summary. To confirm. Assume paid, no text reuse |
| ISO 14064-1 (organization GHG inventories). https://www.iso.org/standard/66453.html | Inventory discipline: boundary, period, method | Claiming conformance | ISO page returned 403. To confirm. Assume paid |
| ML CO2 Impact. https://mlco2.github.io/impact/ | Formula as read: power x time x local grid carbon. Plain method statement. PUE not included | Its purchase-adjustment input and its tree and car equivalents, which clash with E+ wording | Page states no license for the code or data. Cite only. Citation: Lacoste et al. 2019, arXiv:1910.09700 |
| Google, "Measuring the environmental impact of delivering AI at Google Scale". https://arxiv.org/abs/2508.15734 | The best-documented per-prompt disclosure: median Gemini text prompt, May 2025, 0.24 Wh, 0.03 gCO2e. A boundary that includes idle capacity and data-center overhead. A narrower scope gave 0.10 Wh, and Google says that substantially underestimates. Plain caveats | Using it as the figure for any other provider. Google says it does not represent all prompts and has not been verified by a third party | The arXiv page shows a CC BY 4.0 link. Figures can be cited with credit |
| OpenAI, Sam Altman, "The Gentle Singularity". https://blog.samaltman.com/the-gentle-singularity | Nothing for method. It states about 0.34 Wh per average query | Using it as a method. The post gives no method, source or assumption | No license stated on the page. Cite only, as a claim without method |
| Mistral AI, environmental impact study. https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai | A life-cycle method with a named partner and peer review: about 1.14 gCO2e and 45 mL water for a 400-token Le Chat response, terminals excluded. Calls itself a "first approximation" | Comparing it to the Google number. The scopes differ (life cycle against operations) | No license stated on the page. Cite only |
| Hugging Face, AI Energy Score. https://huggingface.co/AIEnergyScore | Comparable energy ratings by task | Treating a rating as a per-reader reading | The page states no license, and method is on a separate site I did not read. To confirm |

The disclosure rows show why scope must travel with every figure. The same
kind of prompt gives 0.24 Wh on one scope and 0.10 Wh on another, and a life
cycle figure is a different quantity again.

## c. How each candidate would be used in E+

All of this is for the `baseline` object in the draft. Energy only in step one.

| Candidate | Exact field | Vintage shown | Fallback when missing |
| --- | --- | --- | --- |
| Ember yearly (row 1) | `baseline.value` per person per month, from yearly demand divided by population | The data year, as "2024 data" style text from the file itself | "no baseline for this region". The panel works as option A |
| Ember monthly (row 2) | Later step: same month last year, per person | Month and year | Fall back to the yearly baseline, label it yearly |
| OWID per-person charts (row 3) | Not used as a source. Use Ember directly, so the license chain is short | n/a | n/a |
| World Bank per-person (row 4) | Held. Same field as row 1 if row 10 clears | Latest year with data | n/a |
| EIA (row 5) | `baseline.value` per household per month for a US reader whose region is a US state. `basis` is `per-household` | Data year (2022 in the FAQ) | Use the Ember per-person baseline for the US country level |
| eGRID, EEA, EDGAR, GCP, Electricity Maps (rows 6, 7, 9, 12, 14) | Not used in step one (carbon) | n/a | n/a |
| IEA, Berkeley Lab (rows 10, 11) | Not in `baseline`. A separate text line "context", not a number divided into the reader's. Only after a person reads the terms | Year and scenario shown | Leave the line out |

### The one baseline to try first

**Ember yearly electricity data (row 1).**

Why:

- Its license is stated on two of Ember's own pages as CC BY 4.0, and I read both.
- It covers over 200 geographies, so most regions a reader can pick have a row.
- It is updated often, and each file has a date.
- It is one publisher, so the license chain is short. OWID and the World Bank
  pass the same data or IEA data through other terms.

What must happen first:

- Open the CSV (or the API) and confirm the per-person demand field, the unit,
  and the latest year. The page did not name them. I did not download the file.
- Divide by a population source that is also cleared. I did not research one.
  Ember or OWID may supply it. That is open.

Second choice for a US reader: **EIA (row 5)**. It is the only source in this
file with no extra condition, and it gives a real household figure. It is
US only.

## What I could not verify

- IEA terms and report (every iea.org page returned 403). Not bypassed.
- Electricity Maps terms (both help pages returned 403). Search summary only.
- ISO pages (403). ISO/IEC TR 20226 seen only in search results.
- The Berkeley Lab report's own rights notice (the PDF redirects to an
  eScholarship page that returned no readable content).
- Global Carbon Project data license (no text found).
- The eGRID data reuse statement.
- Ember's per-person demand field, because I did not open the data file.
- The 1.5 percent IEA data-center share. I saw it only in a search result.
- Whether the SCI spec text is CC BY 4.0 or MIT.
- The fetch tool summarizes pages, so a quote is as the tool returned it.
  A person should open the license pages before the standard relies on them.

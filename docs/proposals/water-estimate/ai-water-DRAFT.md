# DRAFT: AiEDs section 2.6, Water (proposed for 2.5.0)

> **DRAFT. NOT NORMATIVE. NOT WIRED IN.**
> This file is not part of `spec/methodology.md`, the schema, the site build or
> any package. Nobody may build from it. The version number 2.5.0 is a
> placeholder. The owner assigns the final number at publish. Every value
> marked "to confirm" in `PROPOSAL-ai-water.md` is open until confirmed.
> The proposal that explains this text is `PROPOSAL-ai-water.md` in this folder.

## 2.6 Water (DRAFT)

### 2.6.1 What this section is

A disclosure MAY carry a modeled water figure. The figure is a Level 1
modeled estimate, next to energy and carbon. It covers inference only, like
energy and carbon today.

The figure is the water that is consumed, not the water that is withdrawn.
Consumed water is water that evaporates or leaves the local source and does not
return to it.

### 2.6.2 The formula

```
siteL = energyKWh x siteWUE
gridL = energyKWh x gridWaterIntensity
waterL = siteL + gridL
```

- `energyKWh` is the energy already disclosed by sections 2.1 to 2.4.
  Do not compute it twice, and do not change it for water.
- `siteWUE` is water consumed on site for cooling and humidity, in liters per
  kWh. Default: 1.15 L/kWh (Table 5).
- `gridWaterIntensity` is water consumed to make one kWh of grid electricity,
  in liters per kWh, on a consumption basis. Default: 3.1 L/kWh (Table 5).
- `waterL` is liters. A producer MAY also show milliliters.

`siteL` and `gridL` MUST be kept apart in the record. The total MUST equal
their sum.

### 2.6.3 Range

A disclosure with a water figure MUST carry a low and a high figure.
Use the low and high values in Table 5. A producer MUST NOT show the central figure
without the range in the record. A rendered view MAY show only the central
figure, if it also gives a way to see the range.

### 2.6.4 Confidence

Water confidence is `low`. This is a rule, like the token proxy.

A producer MUST NOT raise it above `low` on a plausible estimate. It MAY say
`med` only when two things are true. The site water was metered at the
facility that ran the work. The grid figure is for that facility's own
region and period. `high` is not defined for water in this version.

### 2.6.5 Region

A producer SHOULD use a regional grid figure when Table 5 has one for the
region that served the work. When it has none, the producer MUST use the
default. It MUST record that (`gridBasis` is `default`). A producer MUST NOT apply a figure from one region to a work
served in another and call it regional.

### 2.6.6 Location-based only

The grid term is location-based. It describes the grid that served the work.
A contract to buy power, or a certificate, does not change the water that was
physically consumed. This version defines no market-based water figure.

### 2.6.7 Water comparison (Level 3)

A disclosure MAY show a water comparison. It is an educational comparison.
It is not a claim of impact, credit or benefit.

```
teaspoons = waterL x 1000 / 5
```

A teaspoon is 5 mL. Above 250 teaspoons, a producer SHOULD show liters.

### 2.6.8 Required copy

Every rendered disclosure that shows water MUST carry all three sentences:

- "Energy and carbon are modeled estimates."
- "Tree-Time and equivalents are educational comparisons."
- "Water is a modeled estimate."

The rendered view SHOULD also say what water covers.
Suggested: "Water covers cooling at the data center and the power plants that
supply it."

### 2.6.9 Words that MUST NOT appear

A rendered view MUST NOT use any word in this list about water:

```
offset credit neutral positive saved restored replenished
```

The comparison MUST NOT be
shown as a number of anything to give back.

### 2.6.10 What this section does not cover

- Training water. Inference only.
- Water used to build chips and servers.
- Water scarcity at a place. A liter in a wet region and a liter in a dry
  region count the same here. Say so where the figure is shown.
- Withdrawal. Withdrawn water is not the headline.

### 2.6.11 Table 5 (DRAFT): water coefficients

| Term | Low | Default | High | Basis | Source (see PROPOSAL source table) |
|------|-----|---------|------|-------|-------------------------------------|
| siteWUE (L/kWh) | 0.27 | 1.15 | 1.8 | consumption | S9, S2, S13 |
| gridWaterIntensity (L/kWh) | 1.5 | 3.1 | 9.5 | consumption | S1 |

Vintage: siteWUE default is Google fleet 2024. Grid default is a US average
read from Li et al. (2025, v5). Both are to confirm against their primary
data before publish. A regional table is not drafted here. It would come from
the LBNL Water IMPACT dataset (S13) for US regions only.

### 2.6.12 Document contract (DRAFT)

The optional block is named `water`. See the JSON shape in the proposal.
When it is absent, the disclosure makes no water claim. When a value cannot
be sourced, it is `null`. It is never zero and never a placeholder.

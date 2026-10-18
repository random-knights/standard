# DRAFT: E+ section 12, Ai footprint context

> **THIS IS A DRAFT. IT IS NOT NORMATIVE.**
> It is not part of E+ 1.2.1 or any ratified version. It is not wired into
> `eplus/v1/methodology.md`. The site build does not serve it. It is in no npm
> package. The owner decides whether it becomes text. The reasoning, options
> and open questions are in `eplus/PROPOSAL-ai-footprint-context.md`. The
> baseline research is in `eplus/PROPOSAL-option-b-baselines.md`.
>
> **Version label.** This draft is labeled 1.4.0. That is a working label. The
> final number is assigned at publish.

**Status:** Draft for owner review
**Written:** 2026-10-18, updated the same day with the owner decisions
**Option drafted:** A, juxtaposition only. Option B text is in 12.12.

## 12. Ai footprint context (draft text)

### 12.1 What this section adds

A report may show a reader's modeled Ai footprint beside the Earth Health
Score. This section says how.

The footprint is energy and carbon. It comes from AiEDs. The score comes from
sections 1 to 11. They sit side by side. Neither feeds the other.

The block is called `aiContext`. It is optional. A document with no `aiContext`
conforms exactly as it did before.

### 12.2 What the block must never say

1. It MUST NOT say that the reader's Ai use changed the Earth Health Score.
   The same goes for any domain score and any region score.
2. It MUST NOT say that the reader's Ai use caused any change in the Earth
   system.
3. It MUST NOT say or imply a credit, a balance, a compensation or a cancelling
   of the footprint. The words in the banned list of 12.8 MUST NOT appear in any
   text the block produces, except as 12.8 allows for the name of a third-party
   project.
4. It MUST NOT do arithmetic between the footprint and the score. No ratio, no
   difference, no sum, no per-point figure.
5. It MUST NOT show Tree-Time. Tree-Time stays in the EQ report. This panel
   shows energy and carbon only.

Co-location is not causation. Two numbers on one page are two numbers on one
page.

### 12.3 The personal report block

The block is about one reader or one workspace. That makes it personal. This
section defines it, and the rule is firm.

1. **Personal numbers never appear in the public score document.** The public
   Earth Health Score document (`earth.healthscore.v1`) is the same for
   everyone. It MUST NOT carry `aiContext`. It MUST NOT carry any personal
   figure under any key name, at any depth.
2. A personal report document carries `aiContext`. It sets `meta.audience` to
   `"reader"`. A document with `meta.audience` missing, or set to `"public"`,
   is a public document.
3. A personal report document MUST NOT copy another person's footprint into
   `aiContext`.
4. The personal block holds the footprint, the period, the region used for
   carbon, and the fixed sentences. It holds nothing else about the reader.

### 12.4 The shape

```json
{
  "meta": { "audience": "reader" },
  "aiContext": {
    "mode": "juxtaposition",
    "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "subject": { "kind": "viewer", "label": "string" },
    "footprint": {
      "reading": "reading",
      "energyWh": 0.0,
      "carbonGco2e": 0.0,
      "confidence": "low",
      "provenance": "string",
      "aiedsMethodologyVersion": "2.4.0"
    },
    "region": {
      "source": "reader-set",
      "level": "country",
      "code": "string",
      "gridGco2ePerKwh": 0.0,
      "privacyNoticeUrl": "string"
    },
    "earthScore": { "score": 0.0, "asOf": "ISO 8601", "scope": "global" },
    "baseline": null,
    "thirdPartyNames": [],
    "blendedIntoScore": false,
    "statements": {
      "modeled": "Energy and carbon are modeled estimates.",
      "educational": "Tree-Time and equivalents are educational comparisons.",
      "noCause": "The Earth Health Score does not use this footprint, and this footprint does not move the score."
    }
  }
}
```

The values above show the shape only. They are not data.

| Field | Rule |
| --- | --- |
| `meta.audience` | `"reader"` for a personal report. Required when `aiContext` is present. |
| `mode` | `"juxtaposition"` in this draft. A later version may add `"proportion"` (see 12.12). |
| `period` | The days the footprint covers. Not the day the score was made. |
| `subject.kind` | `"viewer"` or `"workspace"`. |
| `footprint.reading` | `"reading"` or `"no reading"`. |
| `footprint.energyWh`, `carbonGco2e` | A number, or `null` when `reading` is `"no reading"`. |
| `footprint.confidence` | `"high"`, `"med"` or `"low"`, as AiEDs defines them. `null` when there is no reading. |
| `footprint.provenance` | The AiEDs ladder rung for the figure. `null` when there is no reading. |
| `footprint.aiedsMethodologyVersion` | The AiEDs version that made the figures. |
| `region.source` | `"reader-set"`, `"estimated-from-connection"` or `"global-average"`. See 12.5. |
| `region.level` | `"country"`, `"state"` or `"global"`. Nothing finer is allowed. |
| `region.code` | The region as named in AiEDs Table 3, or `null` when `level` is `"global"`. |
| `region.gridGco2ePerKwh` | The grid factor used for carbon. |
| `region.privacyNoticeUrl` | The privacy text that discloses the estimate. Required when `source` is `"estimated-from-connection"`. |
| `earthScore` | A copy of `global.score` and its date from the same report. See 12.7. |
| `baseline` | `null` in this draft. |
| `thirdPartyNames` | A list of names of outside projects, datasets or map layers. See 12.8. Empty by default. |
| `blendedIntoScore` | MUST be the literal `false`. |
| `statements` | The three sentences, verbatim, plus the region sentences when 12.5 asks for them. |

### 12.5 The region for carbon

Carbon needs a grid factor. The factor depends on a region. These rules say
which region.

1. **The reader set a region.** Use it. `region.source` is `"reader-set"`.
2. **The reader set no region.** The report MAY estimate one from the
   connection. The estimate is a country or a state and nothing finer.
   `region.source` is `"estimated-from-connection"`.
3. **The estimate fails, or has no row in AiEDs Table 3.** Use the AiEDs global
   average from Table 3. `region.level` is `"global"` and `region.source` is
   `"global-average"`.
4. **Label it.** An estimated region MUST carry this sentence in
   `statements.regionEstimated`, exactly: "Region estimated from your
   connection, change it." It MUST also carry `statements.regionVpn`, exactly:
   "A VPN can make this region wrong." A global average MUST carry
   `statements.regionGlobal`, exactly: "No region is set, so the AiEDs global
   average is used."
5. **Keep nothing.** A reference implementation MUST NOT store the address or
   the estimate beyond the request that needs it. The document MUST NOT hold
   an address, a city, a postal code or coordinates. It holds `region.source`,
   `region.level` and `region.code` only.
6. **Disclose it.** The privacy text of the product that shows the report MUST
   say that a region is estimated from the connection, that it is not kept, and
   that a VPN can make it wrong. `region.privacyNoticeUrl` points to that text.
7. The estimate never changes `confidence`. The report MUST NOT raise it. A
   guessed region is a reason to say so, not a reason to trust the figure more.

A checker can read the document. It cannot see what a server stores. Rule 5 is
met by the document check and by a written statement from the implementer.

### 12.6 Null and "no reading"

1. A missing footprint is `"no reading"` with `null` figures. It is never zero.
2. A real zero is a reading. It is shown as 0 with its confidence.
3. A report MUST NOT fill a missing figure from an average, a default, a model
   guess or another period.
4. When `reading` is `"no reading"`, the Earth Health Score panel still shows.
   The footprint panel says "no reading" and why, in one plain sentence.
5. `confidence` and `provenance` are copied from AiEDs. The report MUST NOT
   raise them. In AiEDs, `high` needs a direct hardware measurement, and a
   token proxy is `low`.

The global average in 12.5 sets the grid factor only. It does not fill a
missing energy figure.

### 12.7 The two panels

A report that shows `aiContext` shows two panels with clear labels.

1. **Earth Health Score.** The score, its date and its scope.
2. **Your modeled Ai footprint.** Energy in Wh and carbon in gCO2e, each with
   the period and the confidence, and the region used with its label.

The panels MUST sit in one view, with the same weight. The first sentence of
12.9 MUST be on or beside the footprint panel. The `noCause` sentence MUST be
on or beside the pair.

The report MUST NOT draw a line, arrow, bar or color that links the two panels.
It MUST NOT use a color scale to say that the footprint is good or bad against
the score.

`earthScore.score` and `earthScore.asOf` MUST equal `global.score` and its date
in the same report. A checker compares them.

### 12.8 The banned words

The word list below is a hard checker failure. A report that fails it does not
conform.

```
offset, credit, neutral, compensat, cancel, caused by you, because of you, your use moved
```

Matching is by case-insensitive stem. `offset` also matches `offsets`,
`off-set` and `off set`.

**The one exception.** The word "offset" may appear in the NAME of a
third-party project, dataset or map layer. An example is a layer called
"carbon-offset-projects", or a registry's own name. These rules apply:

1. The name MUST sit in `aiContext.thirdPartyNames`, in an object with `name`,
   `kind` (`"project"`, `"dataset"`, `"layer"` or `"registry"`) and `sourceUrl`
   (an https address).
2. The name is the exact name the third party uses. It is shown as a quoted
   proper name, in this fixed form: `Source: "<name>" (<kind>, <sourceUrl>)`.
   No free text sits around it.
3. The word MUST NOT appear anywhere else in `aiContext`. That includes
   `statements`, `provenance`, `subject.label` and every other string.
4. The name never describes, claims or implies anything about the reader's
   figures, Tree-Time, or any figure this standard makes. Rule 2 and rule 3
   keep it so. A sentence that says a project balances the reader's figure is
   not allowed, with or without the word.
5. The exception covers "offset" only. Every other banned term stays a hard
   failure everywhere, third-party names included.

### 12.9 Required sentences

Every report that carries `aiContext` MUST print these three sentences
exactly:

- Energy and carbon are modeled estimates.
- Tree-Time and equivalents are educational comparisons.
- The Earth Health Score does not use this footprint, and this footprint does
  not move the score.

The second sentence names Tree-Time even though this panel shows none. It is a
fixed AiEDs sentence and it also covers any equivalent a later version adds,
such as a baseline comparison.

### 12.10 Conformance rules (draft)

These are the checks a later checker would add. Numbers continue from check 11.

12. **Personal numbers stay out of public documents.** A document with
    `meta.audience` missing or `"public"` FAILS if it has `aiContext`, or any
    key named `energyWh`, `carbonGco2e`, `treeTimeMinutes`, `footprint` or
    `region`, at any depth. A document with `aiContext` and no
    `meta.audience` of `"reader"` FAILS.
13. **Not blended.** `aiContext.blendedIntoScore` is the literal `false`. The
    headline, every region score and every domain score still derive from the
    document with `aiContext` removed. This is the existing check 4 run on the
    stripped document.
14. **Required text.** The three sentences of 12.9 are present and exact. The
    `statements` object has only those keys, plus `regionEstimated` and
    `regionVpn` when `region.source` is `"estimated-from-connection"`, plus
    `regionGlobal` when it is `"global-average"`. Each of those is exact.
15. **Banned words.** No string anywhere in `aiContext` matches the banned
    list of 12.8. The one exception is the `name` field of an object in
    `thirdPartyNames`, and only for "offset". That object MUST have `kind` and
    an https `sourceUrl`. A banned word elsewhere, or a `thirdPartyNames`
    object that breaks 12.8, FAILS. This is a hard failure, not a warning.
16. **Null handling.** If `footprint.reading` is `"no reading"`, then both
    figures, `confidence` and `provenance` are `null`. If it is `"reading"`,
    both figures are finite numbers that are not negative. A figure of `0`
    with `reading` set to `"no reading"` FAILS.
17. **Score copy.** `earthScore.score` equals `global.score` and
    `earthScore.asOf` equals the document date.
18. **No arithmetic.** In `mode` `"juxtaposition"`, `baseline` is `null` and
    no field holds a ratio, share or difference.
19. **Region and privacy.** `region.source` is one of the three values.
    `region.level` is `"country"`, `"state"` or `"global"`. `"global-average"`
    goes with level `"global"` and a `null` code. `"estimated-from-connection"`
    needs `privacyNoticeUrl`. No key named `ip`, `ipAddress`, `city`,
    `postalCode`, `lat`, `lon`, `latitude` or `longitude` appears in
    `aiContext`.
20. **No Tree-Time.** `aiContext` has no key whose name contains `treeTime`.

### 12.11 Test vectors for the new rules

These are test vectors for the checker. They are NOT data and MUST NOT be
shipped or shown to a reader. Each real fixture carries `"testVector": true`.

| Id | What it holds | Expected |
| --- | --- | --- |
| TV-1 | A reading with all fields filled, reader audience, reader-set region, exact sentences | pass |
| TV-2 | `reading` is "no reading", both figures null | pass |
| TV-3 | A true zero energy reading with `reading` set to "reading" | pass |
| TV-4 | No `aiContext` at all, public document | pass |
| TV-5 | Region estimated from connection, both region sentences exact, privacy notice present | pass |
| TV-6 | Global average region, `regionGlobal` exact, null code | pass |
| TV-7 | `thirdPartyNames` holds `"carbon-offset-projects"` with kind "layer" and an https URL | pass |
| FV-1 | `blendedIntoScore` is true | fail, check 13 |
| FV-2 | "no reading" with energy 0 | fail, check 16 |
| FV-3 | `statements.noCause` contains "neutral" | fail, check 15 |
| FV-4 | `earthScore.score` differs from `global.score` | fail, check 17 |
| FV-5 | A required sentence is missing or changed | fail, check 14 |
| FV-6 | `aiContext` inside a public document | fail, check 12 |
| FV-7 | `baseline` present in juxtaposition mode | fail, check 18 |
| FV-8 | "offset" in `statements` | fail, check 15 |
| FV-9 | "offset" in `footprint.provenance` | fail, check 15 |
| FV-10 | "offset" in a third-party `name` with no `sourceUrl` | fail, check 15 |
| FV-11 | "Offsets" or "off-set" in `subject.label` | fail, check 15 |
| FV-12 | "offset" in a `name` key that is not inside `thirdPartyNames` | fail, check 15 |
| FV-13 | "credit" inside a third-party `name` | fail, check 15 |
| FV-14 | A public document that carries `energyWh` under another key path | fail, check 12 |
| FV-15 | Estimated region with no `regionVpn` sentence | fail, check 14 |
| FV-16 | Region holds a `city` key | fail, check 19 |
| FV-17 | `global-average` source with level "country" | fail, check 19 |
| FV-18 | `footprint.treeTimeMinutes` present | fail, check 20 |

### 12.12 Deferred: scale against a baseline (option B)

This part is held until the baseline research is read. See `eplus/PROPOSAL-option-b-baselines.md`. No baseline field is part of this draft yet.

### 12.13 Out of scope

- Mapping the footprint to any of the nine domains (proposal option C). It is
  not drafted. The proposal says why.
- Any change to a weight, a normalizer, a threshold or a published number.
- Any change to AiEDs.

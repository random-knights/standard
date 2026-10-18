# DRAFT: E+ section 12, Ai footprint context

> **THIS IS A DRAFT. IT IS NOT NORMATIVE.**
> It is not part of E+ 1.2.1 or any ratified version. It is not wired into
> `eplus/v1/methodology.md`. The site build does not serve it. It is in no npm
> package. It carries no version number. The owner decides whether it
> becomes text. The reasoning, options and open questions are in
> `eplus/PROPOSAL-ai-footprint-context.md`.
>
> If the owner ratifies it, the section number, the version and the date are
> set at that time. The proposal suggests version 1.4.0 and gives the reason.

**Status:** Draft for owner review
**Written:** 2026-10-18
**Option drafted:** A, juxtaposition only (the proposal recommends it). Option B
text is in the last part, marked deferred.

## 12. Ai footprint context (draft text)

### 12.1 What this section adds

A report may show a reader's modeled Ai footprint beside the Earth Health
Score. This section says how.

The footprint comes from AiEDs. The score comes from sections 1 to 11. They sit
side by side. Neither feeds the other.

The block is called `aiContext`. It is optional. A document with no `aiContext`
conforms exactly as it did before.

### 12.2 What the block must never say

1. It MUST NOT say that the reader's Ai use changed the Earth Health Score.
   The same goes for any domain score and any region score.
2. It MUST NOT say that the reader's Ai use caused any change in the Earth
   system.
3. It MUST NOT say or imply a credit, a balance, a compensation or a cancelling
   of the footprint. The words in the banned list of 12.8 MUST NOT appear in any
   text the block produces.
4. It MUST NOT do arithmetic between the footprint and the score. No ratio, no
   difference, no sum, no per-point figure.
5. It MUST NOT present a Tree-Time or any other equivalent as a credit. It is an
   educational comparison and nothing more.

Co-location is not causation. Two numbers on one page are two numbers on one
page.

### 12.3 Where the block may appear

The block is about one reader or one workspace. That makes it personal data.

1. The public Earth Health Score document (`earth.healthscore.v1`) MUST NOT
   carry `aiContext`. That document is the same for everyone.
2. A report document made for one reader or workspace MAY carry `aiContext`.
3. A report document MUST NOT copy another person's footprint into `aiContext`.

### 12.4 The shape

```json
{
  "aiContext": {
    "mode": "juxtaposition",
    "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
    "subject": { "kind": "viewer", "label": "string" },
    "footprint": {
      "reading": "reading",
      "energyWh": 0.0,
      "carbonGco2e": 0.0,
      "treeTimeMinutes": 0.0,
      "confidence": "low",
      "provenance": "string",
      "aiedsMethodologyVersion": "2.4.0",
      "regionForGrid": "string"
    },
    "earthScore": { "score": 0.0, "asOf": "ISO 8601", "scope": "global" },
    "baseline": null,
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
| `mode` | `"juxtaposition"` in this draft. A later version may add `"proportion"` (see 12.9). |
| `period` | The days the footprint covers. Not the day the score was made. |
| `subject.kind` | `"viewer"` or `"workspace"`. |
| `footprint.reading` | `"reading"` or `"no reading"`. |
| `footprint.energyWh`, `carbonGco2e`, `treeTimeMinutes` | A number, or `null` when `reading` is `"no reading"`. |
| `footprint.confidence` | `"high"`, `"med"` or `"low"`, as AiEDs defines them. `null` when there is no reading. |
| `footprint.provenance` | The AiEDs ladder rung for the figure. `null` when there is no reading. |
| `footprint.aiedsMethodologyVersion` | The AiEDs version that made the figures. |
| `footprint.regionForGrid` | The grid region used for carbon, named as in AiEDs Table 3. `null` when unknown. |
| `earthScore` | A copy of `global.score` and its date from the same report. See 12.6. |
| `baseline` | `null` in this draft. |
| `blendedIntoScore` | MUST be the literal `false`. |
| `statements` | The three sentences, verbatim. |

### 12.5 Null and "no reading"

1. A missing footprint is `"no reading"` with `null` figures. It is never zero.
2. A real zero is a reading. It is shown as 0 with its confidence.
3. A report MUST NOT fill a missing figure from an average, a default, a model
   guess or another period.
4. When `reading` is `"no reading"`, the Earth Health Score panel still shows.
   The footprint panel says "no reading" and why, in one plain sentence.
5. `confidence` and `provenance` are copied from AiEDs. The report MUST NOT
   raise them. In AiEDs, `high` needs a direct hardware measurement, and a
   token proxy is `low`.

### 12.6 The two panels

A report that shows `aiContext` shows two panels with clear labels.

1. **Earth Health Score.** The score, its date and its scope.
2. **Your modeled Ai footprint.** Energy in Wh, carbon in gCO2e, and the
   Tree-Time comparison, each with the period and the confidence.

The panels MUST sit in one view, with the same weight. The two required
sentences of 12.7 MUST be on or beside the footprint panel. The `noCause`
sentence MUST be on or beside the pair.

The report MUST NOT draw a line, arrow, bar or color that links the two panels.
It MUST NOT use a color scale to say that the footprint is good or bad against
the score.

`earthScore.score` and `earthScore.asOf` MUST equal `global.score` and its date
in the same report. A checker compares them.

### 12.7 Required sentences

Every report that carries `aiContext` MUST print these two sentences exactly:

- Energy and carbon are modeled estimates.
- Tree-Time and equivalents are educational comparisons.

It MUST also print the `noCause` sentence of 12.4, exactly.

### 12.8 Conformance rules (draft)

These are written as the checks a later checker would add. Numbers continue
from check 11.

12. **Optional and absent-safe.** A document with no `aiContext` passes. A
    public score document with `aiContext` FAILS (12.3).
13. **Not blended.** `aiContext.blendedIntoScore` is the literal `false`. The
    headline, every region score and every domain score still derive from the
    document with `aiContext` removed. This is the existing check 4 run on the
    stripped document.
14. **Required text.** The three sentences of 12.7 are present and exact. The
    `statements` object has no other keys.
15. **Banned terms.** No string anywhere in `aiContext` contains, in any case,
    one of these: `offset`, `credit`, `neutral`, `compensat`, `cancel`,
    `caused by you`, `because of you`, `your use moved`. A term inside a quoted
    source title is checked by hand, not by the script.
16. **Null handling.** If `footprint.reading` is `"no reading"`, then the
    three figures, `confidence` and `provenance` are `null`. If it is
    `"reading"`, the three figures are finite numbers that are not negative.
    A figure of `0` with `reading` set to `"no reading"` FAILS.
17. **Score copy.** `earthScore.score` equals `global.score` and
    `earthScore.asOf` equals the document date.
18. **No arithmetic.** In `mode` `"juxtaposition"`, `baseline` is `null` and
    no field holds a ratio, share or difference.

### 12.9 Deferred: proportion in context (option B)

This part is NOT drafted as rules. It is held for a later round, because it
needs a cleared baseline source. The proposal lists what a baseline must carry.

If a later round adds it, `mode` becomes `"proportion"` and `baseline` is an
object with at least these fields. All are required. Any missing field means
the document FAILS.

```json
{
  "baseline": {
    "name": "string",
    "region": "string",
    "quantity": "electricity",
    "value": 0.0,
    "unit": "kWh per person per year",
    "vintageYear": 2000,
    "sourceName": "string",
    "sourceUrl": "string",
    "license": "string",
    "updateCadence": "string",
    "confidence": "low",
    "retrievedAt": "ISO 8601"
  },
  "share": { "value": 0.0, "unit": "percent", "rounding": "string" }
}
```

A baseline whose license is not confirmed MUST NOT be used. The share is the
footprint divided by the baseline over the same period, in the same unit, and
nothing else. The baseline is a scale for reading the size of a number. It is
not a target, a budget or a limit.

### 12.10 Out of scope

- Mapping the footprint to any of the nine domains (proposal option C). It is
  not drafted. The proposal says why.
- Any change to a weight, a normalizer, a threshold or a published number.
- Any change to AiEDs.

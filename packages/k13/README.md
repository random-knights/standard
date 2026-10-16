# @randomknights/k13

K13 - Ai General Response Standard, version 3.0.0, as an npm package: the
standard text and a checker for the nine checks of its machine gate.

K13 3.0.0 asks for one pass, the quick squeeze: plain words, one idea per
sentence, the outcome first, short, with every figure traced and the confidence
stated. See the changelog for what changed from 2.x.

The canonical text is `K13.md` in
[random-knights/standard](https://github.com/random-knights/standard). The
package ships that file unchanged.

## Install

```
npm install @randomknights/k13
```

Node 20 or newer. ES modules only. No dependencies.

## Check a file

```
npx k13 check report.md
npx k13 check report.html notes.md
npx k13 check --json report.md
```

Exit code 0 when every file passes the checks that ran, 1 on any finding, 2
on a usage error or an unreadable file. Each finding prints as
`file:line: check: message`.

## The nine checks

The numbers and the tile list are read out of the bundled K13.md at run time. If
a later K13 changes them, the checker follows, or refuses to load when the tile
list no longer matches.

| # | Check | K13 rule | Reads |
| --- | --- | --- | --- |
| 1 | `figures` | Every figure in the prose is in the run data (the evidence, environment card, checks table, header strip and AiEDs tile), or is declared in a sentence "Derived: 8 from 5 and 3 by adding them." whose inputs are run figures. | the prose |
| 2 | `confidence` | "Confidence is high, because ..." (high, moderate or low, and a reason). | the prose |
| 3 | `plain-words` | No word over 12 letters outside a term in backticks or double quotes, a version, a path or a link. No hype word. | the prose |
| 4 | `sentences` | No sentence over 20 words. An average of 14 words or fewer. | the prose |
| 5 | `dash` | No em dash, no en dash, no double hyphen used as a dash. A flag such as `--json`, a table rule and an id such as `a--b` are not dashes. | every file |
| 6 | `cost-line` | The AiEDs tile gives `energyKWh` and `gCO2e`, each a figure or "not reported". | the AiEDs tile |
| 7 | `structure` | The twelve tiles of "The report template", in order. | the report shape |
| 8 | `evidence` | Every command in the evidence tile has its result and every result its command. | the evidence tile |
| 9 | `whats-next` | A role and an effort, or "No next step, this work is complete". No model name. | the What's next tile |

"The reference template shape" means the markup of `templates/temp1ate.md` and
`templates/temp1ate.html` in the standard repository: a `## quick squeeze`
heading and `### Finding`-style tile headings in markdown, `id="quick-squeeze"`
and `data-tile="evidence-blocks"` in HTML. A file in any other shape gets the
dash check only, and the result says the report checks were skipped.

An unfilled template, one that still has FILL markers, runs checks 5, 7, 8 and
9 and says checks 1 to 4 and 6 were skipped, because there is nothing to read
yet.

Prose means the finding, the verdict, how it fits, discrepancies, what's next,
owner actions and what was not done, without code blocks, commands and table
cells. The data tiles (header strip, environment, checks, evidence, AiEDs) are
where run figures come from and are not held to the word limits.

Other passes. A 2.x report that still carries the other five passes is not
failed for them. Only the `## quick squeeze` pass is read for checks 1 to 4 and
6 to 9. The dash check reads the whole file.

## Checks 1 to 5 on a passage

A bare passage and the run figures it came from can be checked directly:

```js
import { checkPassage, checkFigures, checkConfidence, checkPlainWords, checkSentences } from "@randomknights/k13";

checkPassage("Six copies are old. Confidence is high, because we read each one.", ["6"]);
// [] when checks 1 to 5 all pass; otherwise findings { check, message }
```

`LIMITS` is `{ longestWord: 12, longestSentence: 20, averageSentence: 14 }`,
read out of K13.md.

Check 1 reads digit figures and spelled numbers from zero to twelve as the same
figure ("six" and "6"). It does not read the word "one", which is also a
pronoun, so a figure of one is out of its reach.

## Test vectors

`vectors/` ships a passing and a failing vector for each of the nine checks, and
`loadVectors()` and `runVector()` run them:

| File | Content |
| --- | --- |
| `vectors/vectors.json` | the vector list: id, gate, expected result, the message a failing vector must produce, and a passage with its run figures (checks 1 to 5) or a document file with the one defect to plant in it (checks 6 to 9) |
| `vectors/filled-pass.md`, `vectors/filled-pass.html` | filled documents in the template shape that pass all nine checks; the failing vectors for checks 6 to 9 plant one defect in a copy |

The vectors `example-gate-1` to `example-gate-5` read the passage of "One fact,
one pass" and its run data out of K13.md at run time, so the standard's worked
example is held to the gate it teaches. A vector illustrates a check and does
not widen it: where a vector and the numbered list in K13.md disagree, the list
is right.

## What is NOT checked

K13 writes these rules down, and no code checks them. A clean result from this
package is not a full pass of the standard.

- That the writing is plain beyond the word and sentence limits.
- That every claim was actually checked against its source.
- That the confidence is the right confidence, only that it is stated with a
  reason.
- The thirteen steps as a process: cost logged, state verified, owner action
  named.
- The humor rules.

## Library

```js
import { checkFile, checkText, K13_VERSION, LIMITS, NOT_IMPLEMENTED } from "@randomknights/k13";

const result = checkFile("report.md");
// { file, ok, findings: [{ check, message, line? }], ran: [...], skipped: [...] }
```

The text itself is exported as `@randomknights/k13/K13.md`.

## Leaving 2.x

The package no longer exports `LEVELS`, `IDENTIFIERS`, `levelsRegistry`,
`checkNumberAgreement`, `checkGradedValues`, `checkTraceable`,
`checkPassDashes`, `checkGlyphAlternatives`, `checkMarkdownStructure`,
`checkHtmlStructure` or `exampleSixWays`. The rules they held left the standard
in 3.0.0. `checkFigures`, `checkConfidence` and `checkPassage` are the
single-pass counterparts of the first three.

## License

Two licenses, see `NOTICE`:

- The checker code (`src/`, `bin/`): Apache 2.0, in `LICENSE`.
- The standard text (`K13.md`): CC BY 4.0, in `LICENSE-DOCS`. Cite as:
  Random Knights, LLC (2026). K13 - Ai General Response Standard, version 3.0.0.
  CC BY 4.0. https://github.com/random-knights/standard

SPDX: `Apache-2.0 AND CC-BY-4.0`.

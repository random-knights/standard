# @randomknights/k13

K13 - Ai General Response Standard, version 4.1.0, as an npm package: the
standard text and a checker for the thirteen checks of its machine gate.

K13 4.1.0 asks for one pass, the quick squeeze, written like a calm adult
explaining to a smart caveman: simple words, one idea per sentence, correct
grammar, the outcome first, with every figure traced and the confidence stated. It caps the whole answer at a 40-word opening and a 400-word body, and
it requires three report tiles rather than twelve.

K13 is a RESPONSE standard with two modes. Answer mode is every response, and
a machine can run checks 1 to 5 over one with `checkPassage`. Report mode is a
report someone asked for, and `checkFile` runs all thirteen checks on it. See
the changelog for what changed from 3.x.

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

## The thirteen checks

The numbers and the tile list are read out of the bundled K13.md at run time. If
a later K13 changes them, the checker follows, or refuses to load when the tile
list no longer matches.

| # | Check | K13 rule | Reads |
| --- | --- | --- | --- |
| 1 | `figures` | Every figure in the prose is in the run data (the evidence, environment card, checks table, header strip and AiEDs tile), or is declared in a sentence "Derived: 8 from 5 and 3 by adding them." whose inputs are run figures. | the prose |
| 2 | `confidence` | "Confidence is high, because ..." (high, moderate or low, and a reason). | the prose |
| 3 | `plain-words` | No hype word, and no long form K13 replaces, outside a term in backticks or double quotes. | the prose |
| 4 | (retired) | Retired in 4.1.0. It always passes, and the number is kept so checks 5 to 13 keep theirs. | nothing |
| 5 | `dash` | No em dash, no en dash, no double hyphen used as a dash. A flag such as `--json`, a table rule and an id such as `a--b` are not dashes. | every file |
| 6 | `cost-line` | The AiEDs tile gives `energyKWh` and `gCO2e`, each a figure or "not reported". | the AiEDs tile |
| 7 | `structure` | The three REQUIRED tiles of "The report template", in order. An optional tile that appears keeps the canonical order. | the report shape |
| 8 | `evidence` | Every command in the evidence tile has its result and every result its command. | the evidence tile |
| 9 | `whats-next` | A role and an effort, or "No next step, this work is complete". No model name. | the What's next tile |
| 10 | `ceiling-headline` | The "what happened" tile runs to 40 words or fewer. | the finding tile |
| 11 | `ceiling-body` | The prose of the report runs to 400 words or fewer, outside data. | the report prose |
| 12 | `first-pass` | The first paragraph of the "what happened" tile holds no term of art, from the list K13.md names. | the finding tile |
| 13 | `precision` | No figure with a decimal part claims more significant figures than the stated confidence supports: 2 for low or a class estimate, 3 for moderate. | the cost tile and the prose |

Checks 10 to 13 read a K13 ANSWER or REPORT. K13 4.0.0 exempts reference text
from the ceiling by name, so these run on a parsed report and never on a plain
document. Check 13 reads a figure with a decimal part only: an exact count is
not an estimate, and a version and a date are not figures.

"The reference template shape" means the markup of `templates/temp1ate.md` and
`templates/temp1ate.html` in the standard repository: a `## quick squeeze`
heading and `### Finding`-style tile headings in markdown, `id="quick-squeeze"`
and `data-tile="evidence-blocks"` in HTML. A file in any other shape gets the
dash check only, and the result says the report checks were skipped.

An unfilled template, one that still has FILL markers, runs checks 5, 7, 8 and
9. It says the content checks (1 to 4, 6, and 10 to 12) were skipped, because
there is nothing to read yet.

Prose means the finding, the verdict, how it fits, discrepancies, what's next,
owner actions and what was not done, without code blocks, commands and table
cells. The data tiles (header strip, environment, checks, evidence, AiEDs) are
where run figures come from and are not held to the prose rules.

Other passes. A 2.x report that still carries the other five passes is not
failed for them. Only the `## quick squeeze` pass is read for checks 1 to 3 and
6 to 9. The dash check reads the whole file.

## Checks 1 to 5 on a passage

A bare passage and the run figures it came from can be checked directly:

```js
import { checkPassage, checkFigures, checkConfidence, checkPlainWords } from "@randomknights/k13";

checkPassage("Six copies are old. Confidence is high, because we read each one.", ["6"]);
// [] when checks 1 to 5 all pass; otherwise findings { check, message }
```

`LIMITS` is `{ openingWords: 40, bodyWords: 400 }`, read out of K13.md.
`checkSentences` was removed in 4.1.0 with check 4. `TILES`,
`REQUIRED_TILES`, `TERMS_OF_ART` and `PRECISION` are read from it too.

Check 1 reads digit figures and spelled numbers from zero to twelve as the same
figure ("six" and "6"). It does not read the word "one", which is also a
pronoun, so a figure of one is out of its reach.

## Test vectors

`vectors/` ships a passing and a failing vector for each of the thirteen
checks, and `loadVectors()` and `runVector()` run them:

| File | Content |
| --- | --- |
| `vectors/vectors.json` | the vector list: id, gate, expected result, the message a failing vector must produce, and a passage with its run figures (checks 1 to 5) or a document file with the one defect to plant in it (checks 6 to 13) |
| `vectors/filled-pass.md`, `vectors/filled-pass.html` | filled documents in the template shape that pass all thirteen checks; the failing vectors for checks 6 to 13 plant one defect in a copy |
| `vectors/minimal-pass.md` | the smallest conforming report: the three required tiles and nothing else. K13 3.0.0 would have failed it nine times |

The vectors `example-gate-1` to `example-gate-5` read the passage of "One fact,
one pass" and its run data out of K13.md at run time, so the standard's worked
example is held to the gate it teaches. A vector illustrates a check and does
not widen it: where a vector and the numbered list in K13.md disagree, the list
is right.

## What is NOT checked

K13 writes these rules down, and no code checks them. A clean result from this
package is not a full pass of the standard.

- The voice: simple words, one idea per sentence, correct grammar and no
  inside jokes. A program cannot judge a sentence.
- That every claim was actually checked against its source.
- That the confidence is the right confidence, only that it is stated with a
  reason.
- The thirteen steps as a process: cost logged, state verified, owner action
  named.
- The humor rules: at most one dry joke, off for money, safety, security,
  privacy, legal, tax, errors the user did not cause and a frustrated user,
  and never on a number.
- The everyday comparison of the first pass. It is only weakly checkable, and
  K13 says so in its own gate table.
- The tone: that bad news leads, and that nothing was softened first.
- That the answer lives in the reply, and was not also written to a file.
- That no unrequested document, plan file or note was written beside it.
- That a claim about state was really verified, only that evidence is named.
- That the answer does not restate or contradict itself.
- The precision of an exact count, a version or a date.

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
  Random Knights, LLC (2026). K13 - Ai General Response Standard, version 4.1.0.
  CC BY 4.0. https://github.com/random-knights/standard

SPDX: `Apache-2.0 AND CC-BY-4.0`.

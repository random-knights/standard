# @randomknights/k13

K13 - Ai General Response Standard, version 2.2.0, as an npm package: the standard
text and a small checker for the K13 rules that are implemented in code.

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

## What is checked

Every check below is a rule written in K13.md, and every one is a port of a
gate that already runs: the structure, evidence and What's next checks hold
the K13 reference templates in the standard repository, and the dash check is
the Random Knights workspace docs gate.

| Check | K13 rule | Runs on |
| --- | --- | --- |
| `dash` | Machine gate 4 and step 13: no em dash and no en dash anywhere, code included; no double hyphen used as a dash, meaning `--` with whitespace or a line edge on both sides, outside fenced code and inline code. A flag such as `--json`, a markdown table rule and an id such as `a--b` are not dashes. | every file |
| `structure` | Machine gate 5 and "Structural invariance": all six normative levels present, and the same twelve tiles in the order "The report template" lists them, at every level. | `.md` and `.html` reports in the reference template shape |
| `evidence` | Machine gate 6: every evidence block has its command and its rendered result, and the counts match. | `.html` reports in the reference template shape |
| `glyph-alt` | "The response levels": every rendered level glyph has a text alternative, either `aria-hidden="true"` beside the visible level name or `role="img"` with an `aria-label`. This is a rendering rule, not one of the six gate checks. | `.html` reports in that shape |
| `whats-next` | "What's next": a role slot and an effort slot, the answer "No next step, this work is complete" always offered, and no model name. | `.html` reports in that shape; the markdown port checks the slots and the completion answer only |

"The reference template shape" means the markup of `templates/temp1ate.md`
and `templates/temp1ate.html` in the standard repository: level headings such
as `## energy drink` and tile headings such as `### Evidence` in markdown,
`<div id="pane-energy_drink">` and `data-tile="evidence-blocks"` in HTML. A
file in any other shape gets the dash check only, and the result says the
structure checks were skipped.

The level names and the tile order are read out of the bundled K13.md at run
time. If a later K13 changes the tile list, the package refuses to load rather
than checking against a stale list.

## Machine gate checks 1 to 3, on the passes of a report

Checks 1, 2 and 3 compare the written passes of a report with each other or
with the run data, so they take the six passes as an object keyed by level name
rather than a whole file (the passes of free text cannot be located reliably):

```js
import { checkNumberAgreement, checkGradedValues, checkTraceable } from "@randomknights/k13";

checkNumberAgreement(passes);                 // gate 1
checkGradedValues(passes, graded);            // gate 2
checkTraceable(passes, ["14", "2.0.0"]);      // gate 3, with the run's figures
```

Gate 1 reads digit figures and spelled numbers from zero to twelve as the same
figure ("six" and "6"). It does not read the word "one", which is also a
pronoun, so a disagreement between "one" and "two" is out of its reach. Gate 2
holds the author to graded values the author declares: for each level a
`verdict`, `confidence` and `provenance`, each `{ value, quote }`, where the
quote must appear in that level's pass and the value must be the same at every
level.

## Test vectors

`vectors/` ships a passing and a failing vector for each of the six machine
gate checks, and `loadVectors()` and `runVector()` run them:

| File | Content |
| --- | --- |
| `vectors/vectors.json` | the vector list: id, gate, expected result, the message a failing vector must produce, and the six passes (gates 1 to 4) or a report file (gates 5 and 6) |
| `vectors/gate-5-pass.md`, `gate-5-fail.md` | six-level markdown reports; the failing one drops a tile at one level |
| `vectors/gate-6-pass.html`, `gate-6-fail.html` | six-level HTML reports; the failing one has a command with no result at one level |

The vector `example-gate-1` and `example-gate-2` read the six passes of "One
fact, six ways" out of K13.md at run time, so the standard's worked example is
held to the gate it teaches. A vector illustrates a check and does not widen
it: where a vector and the numbered list in K13.md disagree, the list is right.

## The levels registry

`levelsRegistry()` returns the ladder table and the identifier table of K13.md
as data (level, identifier, grades, step, codepoint, legacy stored identifier,
default). The standard repository's site build writes it as
`k13/v1/k13-levels.json`, so the ladder has one source.

## What is NOT checked

K13 writes these rules down, and no code checks them yet. A clean result from
this package is not a full pass of the K13 machine gate.

- Machine gates 1, 2 and 3 on a whole file. They run on the passes of a report
  you give to the functions above. Gate 3 also needs the run data.
- Machine gate 6 and the model-name rule for markdown reports.
- That each pass is written at its response level.
- The thirteen steps as a process: cost logged, state verified, owner action
  named.
- The humor rules.

## Library

```js
import { checkFile, checkText, K13_VERSION, NOT_IMPLEMENTED } from "@randomknights/k13";

const result = checkFile("report.md");
// { file, ok, findings: [{ check, message, line? }], ran: [...], skipped: [...] }
```

The text itself is exported as `@randomknights/k13/K13.md`.

## License

Two licenses, see `NOTICE`:

- The checker code (`src/`, `bin/`): Apache 2.0, in `LICENSE`.
- The standard text (`K13.md`): CC BY 4.0, in `LICENSE-DOCS`. Cite as:
  Random Knights, LLC (2026). K13 - Ai General Response Standard, version 2.2.0.
  CC BY 4.0. https://github.com/random-knights/standard

SPDX: `Apache-2.0 AND CC-BY-4.0`.

# @randomknights/k13

K13 - AI Response Standard, version 2.0.0, as an npm package: the standard
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

## What is NOT checked

K13 writes these rules down, and no code checks them yet. A clean result from
this package is not a full pass of the K13 machine gate.

- Machine gate 1, number agreement across levels.
- Machine gate 2, every graded value (verdict, confidence, provenance) present
  at every level.
- Machine gate 3, no untraceable figure. This needs the run data, not the
  report.
- Machine gate 6 and the model-name rule for markdown reports.
- The reading level of each pass.
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
  Random Knights, LLC (2026). K13 - AI Response Standard, version 2.0.0.
  CC BY 4.0. https://github.com/random-knights/standard

SPDX: `Apache-2.0 AND CC-BY-4.0`.

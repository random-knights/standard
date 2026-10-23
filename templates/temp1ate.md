# K13 Report: [Lab Name]

<!-- K13 v4.0.0 template for offline viewing.
     One pass: the quick squeeze. Same structure as temp1ate.html but rendered
     as markdown.
     License: this template is Apache 2.0, a reference implementation you may
     fork without attribution friction. The REQUIREMENT it renders, the
     ordered section list in K13.md under "The report template", is
     specification text and is CC BY 4.0. Fork the markup; cite the standard.
     Rules:
       - No em dashes (U+2014). Gate fails on one.
       - No en dashes (U+2013), and no double hyphen used as a dash. Use a
         comma, a colon, or a new sentence.
       - ONE PASS. Write the quick squeeze once. Plain words, one idea per
         sentence, outcome first.
       - LIMITS (K13.md "The limits"). No word over 12 letters outside a term in
         backticks or double quotes. No sentence over 20 words. An average
         sentence of 14 words or fewer. No hype words.
       - FIGURES. Every figure in the prose appears in the run data (the header
         strip, the environment card, the checks table, the evidence, the AiEDs
         tile), or is declared in its own sentence: "Derived: 8 from 5 and 3 by
         adding them."
       - CONFIDENCE. Say it once, with what it rests on: "Confidence is high,
         because ...". It lives in the Verdict tile.
       - STRUCTURE. The first three tiles are REQUIRED, in this order:
         Finding, AiEDs disclosure, What's next. The other nine are OPTIONAL
         and keep this order when they appear. This template fills all twelve,
         which is allowed. A required tile with nothing to report says so in
         one line.
       - CEILING (K13.md "The whole answer"). The Finding tile runs to 40 words
         or fewer. The prose of the whole report runs to 400 words or fewer.
         Anything longer goes in a linked artifact.
       - FIRST PASS (K13.md "The first pass"). The first sentence names the
         thing in words a beginner knows, with no term of art, and gives one
         everyday comparison.
       - EVIDENCE BLOCKS. Every command or query appears with its real rendered
         result. A command with no result, or a result with no command, fails
         the gate. Never fabricate a result. If one is too large, show a stated
         subset and say what was cut.
       - COST LINE. Give energyKWh and gCO2e in the AiEDs tile, each a figure
         or the words "not reported".
       - All claims must be verified. No plausible defaults. -->

---

## quick squeeze

One pass. Plain words. One idea per sentence. Outcome first.

### Finding

FILL: One plain sentence. What happened, not how.

### AiEDs disclosure

AiEDs, the AI Energy Disclosure Standard, methodology 2.1.0. FILL: one sentence on model usage and data access.

| Field | Value |
| --- | --- |
| energyKWh | FILL |
| gCO2e | FILL |
| compute.tokens | FILL: in plus out |
| confidence | FILL: low / med / high, or a number 0 to 1. Any token proxy is low. |
| provenance | FILL: measured / vendor-published / class-estimated / synthetic / unknown |
| subject.name | FILL: lab-slug |
| generatedAt | FILL: YYYY-MM-DD |
| scope | FILL: device / usage / inference / training |

FILL: PPI statement. Example: "No member PPI accessed." Or say what was used and how it was protected.

### What's next

FILL: what someone could do next, in plain words. Not the owner's job, anyone's.

| slot | value |
| --- | --- |
| role | FILL: the role for the next task, from your published role list |
| why that role | FILL: one line against that list's stated criteria, so a reader can disagree |
| effort | FILL: the effort or reasoning level |

Command:

```
FILL: paste-ready, in your own dispatch shape, complete enough to run cold
(K13 step 7: pull it from your command template library, do not write it
from memory)
```

No continuation? Delete the table and the command and write "No next step, this
work is complete.", then say why. Never manufacture a continuation to fill this
tile. Do NOT name a model here: K13 requires role and effort and is
vendor-neutral. If you resolve role plus effort to a model from your own
published mapping, cite the mapping beside it.

### Report

| | |
| --- | --- |
| Lab | FILL: NN-lab-slug |
| Date | FILL: YYYY-MM-DD |
| Title | FILL: short lab title, 3 to 6 words |
| Summary | FILL: one sentence, what this work investigated |
| Gate | FILL: passed / failed / raise / blocked |
| Model | FILL |
| Runs | FILL |

### Verdict

**gate:** FILL: the exact gate string

**confidence:** FILL: high, moderate or low, then "because" and what it rests on, in one sentence

FILL: what the gate word means in plain language, no jargon

### How it fits

FILL: what bigger job this was part of, in everyday words, and what it lets people do now

FILL: what preceded this work, and what it unblocks.

### Environment

| | |
| --- | --- |
| what was run | FILL: the command or suite |
| where | FILL: host, runner or clone path |
| version | FILL: toolchain version |
| commit | FILL: full sha |
| branch | FILL |
| when | FILL: ISO timestamp |

### Checks

| check | how it was verified | result |
| --- | --- | --- |
| FILL | FILL: the command or observation | PASS |
| FILL | FILL | FAIL |
| FILL | FILL | PARTIAL |

### Evidence

Command or query:

```
FILL: the exact command, query or script you ran
```

Result:

```
FILL: the real rendered output. Never fabricated. If it is too large to show,
show a stated subset and say what was cut.
```

Command or query:

```
FILL: second piece of evidence, or delete this whole block from every level at once
```

Result:

```
FILL: its real rendered output
```

### Discrepancies

FILL: anything that did not match, said plainly. Write "nothing did not match" if nothing did.

### Owner actions

1. FILL: the exact thing the owner has to do, named in plain words above the command

```
FILL: the exact command, ready to paste
```

2. FILL: the second owner action

```
FILL: the exact command
```

### What was not done

FILL: what was left out, and why, in one plain sentence


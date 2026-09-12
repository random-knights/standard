# K13 Report: [Lab Name]

<!-- K13 v2.0.0 template for offline viewing.
     Six levels, all six NORMATIVE under K13 2.0.0. Same structure as
     temp1ate.html but rendered as markdown.
     Licence: this template is Apache 2.0, a reference implementation you may
     fork without attribution friction. The REQUIREMENT it renders, the
     ordered section list in K13.md under "The report template", is
     specification text and is CC BY 4.0. Fork the markup; cite the standard.
     Rules:
       - No em dashes (U+2014). Gate fails on one.
       - No en dashes (U+2013), and no double hyphen used as a dash. Use a
         comma, a colon, or a new sentence.
       - Levels are "levels," never "reading levels."
       - STRUCTURAL INVARIANCE. Every level carries all twelve tiles, in this
         order. Only the register changes: the finding sentence, the narrative
         prose and the wording of actions. Data cells are byte-identical at
         every level. A level that adds a tile the others lack, or omits one
         they have, fails the gate.
       - EVIDENCE BLOCKS. Every command or query appears with its real rendered
         result. A command with no result, or a result with no command, fails
         the gate. Never fabricate a result. If one is too large, show a stated
         subset and say what was cut.
       - Lead with the outcome at every level.
       - Every level states the same facts and the same figures. More figures
         at a higher level is a detail ladder and fails K13 step 13.
       - All claims must be verified. No plausible defaults. -->

---

## juice box (K-5) &#x1F9C3;

Normative level 1 of 6. Register: No jargon at all. One idea per sentence.

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

### Finding

FILL: One plain sentence. What happened, not how.

### Verdict

**gate:** FILL: the exact gate string

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

---

## soda pop (6-8) &#x1F964;

Normative level 2 of 6. Register: One new term at a time, explained as it appears.

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

### Finding

FILL: the same outcome at middle-school specificity. Introduce one term, explain it.

### Verdict

**gate:** FILL: the exact gate string

FILL: the gate word with one or two terms, each explained inline

### How it fits

FILL: the plan or project this belongs to, what it unblocks, and what came before it

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

FILL: what did not match, with each term explained as it appears

### What's next

FILL: concrete next steps a reader could take, with any new term explained

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

### Owner actions

1. FILL: the owner action, with the one term it needs explained

```
FILL: the exact command, ready to paste
```

2. FILL: the second owner action

```
FILL: the exact command
```

### What was not done

FILL: what was not done and why, with terms introduced as they appear

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

---

## energy drink (9-12) &#x1F9CB;

Normative level 3 of 6. Register: Real terms, defined once. The default level.

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

### Finding

FILL: the outcome with technical terms used correctly, defined on first use

### Verdict

**gate:** FILL: the exact gate string

FILL: the gate result with full technical framing

### How it fits

FILL: the lane or plan item, what it unblocks downstream, and the work it followed

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

FILL: every discrepancy, named with the real system names

### What's next

FILL: concrete continuations: what to build, measure or check next

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

### Owner actions

1. FILL: the owner action and why only the owner can run it

```
FILL: the exact command, ready to paste
```

2. FILL: the second owner action

```
FILL: the exact command
```

### What was not done

FILL: what was out of scope, and the reason it was out of scope

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

---

## black coffee (College) &#9749;

Normative level 4 of 6. Register: Full precision. Look it up yourself.

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

### Finding

FILL: the precise claim. All specifics present. No softening.

### Verdict

**gate:** FILL: the exact gate string

FILL: the gate result with full precision and measured scope

### How it fits

FILL: the exact plan item, the dependency it releases, and the preceding work by id

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

FILL: each discrepancy with its exact magnitude and where it was observed

### What's next

FILL: precise continuations, each with the system and parameter it touches

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

### Owner actions

1. FILL: the owner action, exact system, exact parameter, exact owner

```
FILL: the exact command, ready to paste
```

2. FILL: the second owner action

```
FILL: the exact command
```

### What was not done

FILL: what was explicitly out of scope, and what would bring it into scope

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

---

## loose leaf (Masters) &#x1FAD6;

Normative level 5 of 6. Register: Architecture level. Cross-system scope and confidence bounds.

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

### Finding

FILL: the architecture-level claim, with cross-system scope if applicable

### Verdict

**gate:** FILL: the exact gate string

FILL: the gate verdict with architectural framing and confidence bounds

### How it fits

FILL: where this sits in the system architecture, what it unblocks across systems

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

FILL: discrepancies framed as architectural consequences, with confidence bounds

### What's next

FILL: systemic continuations, each with its architectural rationale

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

### Owner actions

1. FILL: the owner action and the architectural reason it cannot be automated

```
FILL: the exact command, ready to paste
```

2. FILL: the second owner action

```
FILL: the exact command
```

### What was not done

FILL: the assumptions and edge cases not covered, and what covering them would cost

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

---

## yerba mate (Doctorate) &#x1F9C9;

Normative level 6 of 6. Register: Formal. Methodology, sample, generalizability, limitations.

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

### Finding

FILL: the research-grade claim with explicit confidence scope

### Verdict

**gate:** FILL: the exact gate string

FILL: the formal gate result with scope, confidence, and known limits

### How it fits

FILL: the formal relation to the wider programme of work, and what it enables next

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

FILL: discrepancies with their significance, and what would change the conclusion

### What's next

FILL: open questions this work raises but does not close, and hypotheses to test

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

### Owner actions

1. FILL: the owner action, stated formally, with its preconditions

```
FILL: the exact command, ready to paste
```

2. FILL: the second owner action

```
FILL: the exact command
```

### What was not done

FILL: the limitations of this inspection, the sample, and the limits on generalizability

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

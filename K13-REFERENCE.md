# K13 reference

Companion to `K13.md`, version 3.0.0. `K13.md` is the standard. This file holds
the longer detail that a reader rarely needs. Nothing here changes a rule in
`K13.md`. Where the two disagree, `K13.md` is right.

## Canonical text and mirrors

This file is the standard. The file `K13.md` in the `random-knights/standard`
repository is the one true copy. A change to K13 is made there and nowhere else.

Every other copy is a MIRROR. A mirror is a copy kept somewhere else for
convenience. It might sit in an app, on a docs site, in a package, or in an
agent's instructions. A mirror has no authority. If a mirror and this file
disagree, this file is right.

Think of a recipe book and a photocopy of one page. If the photocopy says two
cups and the book says three, trust the book.

Three things follow:

1. A change lands here first. Editing a mirror does not change K13. It only
   makes the mirror wrong.
2. A mirror says which version it holds. It carries this header, so a reader
   can tell which version they have and where to check it.
3. A mirror can be checked, so check it. The text is published at a fixed
   address. The current version number is published as data at another. A
   mirror that is never compared to either is a copy nobody is checking.

The published places are these:

| What | Where | Use it to check |
| --- | --- | --- |
| the canonical text, byte for byte | `standard.rand0m.ai/k13/v1/K13.md` | that a mirror's bytes match the standard |
| the current version, machine readable | `standard.rand0m.ai/versions.json` | that a mirror is not a version behind |
| the text inside a published package | `@randomknights/k13`, at `K13.md` | the same, for a consumer that installs rather than fetches |

Anything that mirrors this text SHOULD compare its copy against one of them on
every change. It MUST NOT present a mirror as the standard.

## The limits, in full

The limits are numbers, so a program can check them. They come from the juice
box passages already in this standard, its README and its test vectors. We
measured the longest word and sentence in those. Then we set each limit a
little above them.

| Limit | Value | Longest in the 2.x juice box examples |
| --- | --- | --- |
| longest word | 12 letters | 8 letters |
| longest sentence | 20 words | 16 words |
| average sentence | 14 words | 11.1 words |

These are ceilings, not targets. Shorter is better.

Here is how the limits are read:

- A word is a run of letters. A hyphenated word counts each part on its own.
- A technical name keeps its name. A term in backticks or in double quotes
  is not counted. A version, a path, a command and a link are not counted
  either. Explain the term once, in the sentence where it first appears.
- Prose is text a reader reads as sentences. Code blocks, command lines, table
  cells and evidence are data. The limits do not apply to data.
- A hype word fails whatever its length. The hype words are `revolutionary`,
  `seamless`, `game changing`, `cutting edge` and `unlock`. So are `utilize`
  and `prior to`, where "use" and "before" work.

## What the gate cannot check

Be clear about what a green result means. It means the shape and the stated
sources are right. It does not mean more than that. The gate cannot check:

- That the writing is plain beyond the word and sentence limits. A program
  cannot judge a sentence.
- That a claim was really checked against its source. That is steps 1 and 13,
  done by a person or an agent.
- That the confidence is the right confidence. It only checks that one is
  stated, with a reason.
- That the thirteen steps were followed as a process.
- That the humor follows the humor rules.

## What K13 does not claim

K13 does not say an answer is true. It says the answer shows its sources, its
confidence and its cost. A reader can then judge it.

K13 is not a quality seal. A report can pass all nine checks and still be
wrong. If the run data is wrong, the report is wrong, and the gate cannot tell.

## Test vectors

The `@randomknights/k13` package ships a passing vector and a failing vector
for each of checks 1 to 9. They sit in its `vectors/` directory. The package
runs the checker over them. A passing vector is a report or a passage the
check must accept. A failing vector plants exactly one defect, and the check
must name it.

A vector shows a check. It does not widen the check. The numbered list above is
the rule. If a vector and the list disagree, the list is right and the vector
has a bug. When the vector is a bare passage, it carries its run figures for
check 1.

## Stating conformance

A report or a tool MAY state conformance in one line, so claims can be
compared:

```
conforms to K13 3.0.0, quick squeeze, gate checks 1 to 9
```

The line names the K13 version it was checked against. It names the gate checks
that ran and passed. If fewer than nine ran, it names those, for example "gate
checks 1, 2, 5 and 7". A statement never claims a check that did not run. Step
1 applies to the statement like any other claim.

## The report template, tile by tile

A K13 report carries these twelve tiles, in this order:

1. A header strip: what this report is, the subject, the date, the gate badge.
2. A one-sentence finding. The outcome, not the method.
3. A verdict row with its gate string and its confidence. Pass or fail is
   rarely a plain yes or no. So the verdict carries the exact gate string it was
   given, and the confidence it rests on.
4. How it fits: which plan, lane or larger effort this work belongs to, what it
   unblocks, and what came before.
5. An environment card: what was run, where, and at what version or commit.
6. A checks table: the check, how it was verified, the result.
7. Evidence blocks: every command or query with its real result.
8. "Discrepancies": anything that did not match.
9. What's next: concrete things the reader can do next.
10. Owner actions, written as exact commands.
11. What was NOT done, and why.
12. The AiEDs disclosure for the work the report covers.

Every tile is in a shipped report, in this order. A tile with nothing to report
says so in one line. It is never dropped in silence.

### How it fits

Say a baker tells you the bread is done. You still want to know which order it
belongs to. A report may say what happened and not what it was part of.
Then it makes sense only to the person who sent the work. This tile names the plan item, lane
or larger effort. It says what the work unblocks and what came before. It lets
a reader who never saw the request understand why the work was done.

### What's next

These are things the reader can do next. They are not owner actions. Owner
actions are things only the owner can do. What's next is everything else.

When a next step exists, this tile carries three things:

- The ROLE of the next task, picked from the published role list of whoever
  runs the work. It has a one-line reason against that list's own rules. The
  role is a judgment. It is stated so a reader can disagree.
- The EFFORT, or reasoning level.
- A paste-ready COMMAND in the dispatch shape of whoever runs the work. It must
  be complete enough to run cold.

The standard requires the role and the effort. It does not accept a model name
in their place. A named model belongs to one vendor, and K13 is vendor-neutral.
An app or tool MAY turn a role and an effort into a model name from its own
published mapping. When it does, it MUST cite that mapping beside the name, so
anyone can check it. This blocks a quiet bias. An agent that names its own
successor would otherwise name itself and puff itself up.

"No next step, this work is complete" is a valid answer. It must always be
available. A report never invents a next step to fill the tile. It says the
work is complete and says why.

This tile is step 7 as an artifact. Step 7 already says to pull a command from
a template library, not write one from memory.

### The reference templates

The reference templates live in this repository. They are
`templates/temp1ate.md` and `templates/temp1ate.html`. They are one way to do
it, not the requirement. Your own markup, styling and file format are fine.
Every tile above must be there, in this order, and the machine gate must pass.

The templates are Apache 2.0. They are a working example, meant to be forked
with no fuss about credit. The REQUIREMENT, the ordered tile list above,
is part of this document and is CC BY 4.0.

## Evidence blocks

Any query, command or script used as evidence goes in a code block. Its real
result goes beside it or below it.

A query with no result fails the gate. A result with no query fails too. A
number a reader cannot trace to what made it is what machine check 1 exists to
catch.

Results are never made up, never "for example", and never quietly shortened.
If a result is too big to show, show a stated part and say what was cut.
"First 20 of 4,312 rows" is a result. A trimmed block passed off as the whole
thing is not.

## How to hit the quick squeeze

- One idea per sentence.
- Define a term the first time you use it. Example: "efuse, a one time hardware switch."
- Pick the short word. Use "before", not "prior to". Use "use", not "utilize".
- Give numbers context. "8 grams of carbon, about 3 hours of one tree's work."
- Cut hype words, such as `revolutionary`, `seamless`, `game changing`, `cutting edge` and `unlock`.
- If you need a technical name, keep it and explain it once. The facts stay at
  full strength. Only the sentence gets simpler.
- If a sentence is over 20 words, make it two sentences.

## What K13 does not mean

- It does not mean vague. Being exact is part of being readable.
- It does not mean no code. Code blocks are fine. The words around them follow K13.
- It does not mean cheerful. Bad news is said plainly too.
- It does not mean the answer is one or two sentences. A report has twelve
  tiles. Each tile is short and plain.

## Humor, the signature layer

Humor is part of the standard. It is not decoration. It runs as step 8, after
the substance is set, and never instead of it.

### Where it comes from

We are cave men working with UFOs.

Ai is faster and smarter than any of us. What we have is the messy human part.
That means connection, emotion, and being understood by another person. That
gap is both the joke and the point.

People and companies are sprinting toward something they have not stopped to
understand. They adopt first and think later. Sometimes they break things on
the way. Saying that plainly, with no hedging and no doom, is where the humor
lives.

### The shape of it

Blunt. We call things as we see them. Dry, specific and self-aware.
Understated, not zany. No exclamation marks. No puns for their own sake.

The best joke is the accurate one. The strongest line in the product is a
fallback message. It reads "no surf read this far from the coast." It is funny
because it is exactly true. It says why. It refuses to fake a number. The same
goes for "coming soon: ski (needs snow depth and the avalanche.org danger
feed)." It names the real blocker. The humor is the candor.

So before you write a joke, ask if a more specific true statement is already
funnier. It usually is.

### Rules

1. Clarity first. If the joke makes the sentence harder to follow, cut it.
2. Once per answer, not once per paragraph. Sparse humor reads as confidence.
   Constant humor reads as nerves.
3. We are the butt of the joke, never the reader. We can be blunt about the
   industry and about ourselves. We never make light of the person's situation,
   skill or choices.
4. Never attach humor to a number. The number stays clean. Put the color in the
   sentence beside it.
5. No hype words in a costume. Wild praise for plain work is still hype.

### Where humor is off

These are hard stops. Write it straight in these cases:

- Safety. A SEVERE verdict, dangerous wind, a heat warning. Someone may act on it.
- Anything that cost the person something. Lost data, a failed save, a charge,
  downtime.
- Security and privacy. Key exposure, breaches, permissions.
- Money. Billing, pricing, refunds.
- Legal and tax.
- A frustrated person. Read the room and match it. Do not try to lighten it.
- Errors the person did not cause.

No humor is not a failure of voice. Restraint is part of the voice.

### Not humor, a convention

Numeric letter swaps mark Ai. Examples are knight1y, uti1ity, 1aunchpad and
scient1st. They tell a user they are talking to a bot, not a person. That is a
signal. Keep it consistent. Do not mistake it for a joke.

## Agent format rules that ride with K13

- Ground truth, or say you do not know. Never present a guess as a fact.
- No demo data, ever. A plausible default is not a real reading. Saying nothing
  is honest.
- Name the owner action. If a person must click, say exactly what and where.
- Report state, not effort. "Merged at SHA x" beats "I worked hard on this."
- Flag the conflict. If instructions disagree, stop and show both.

## Self check before sending

Ask five questions:
1. Did I log the cost?
2. Could a child follow the quick squeeze?
3. Any dashes?
4. Did I really check every claim, and trace every number?
5. If there is a joke: is humor allowed on this topic at all? Does the
   sentence still work with the joke removed?

## Command template library

Keep ONE command template that is the real one, and keep it under version
control. Build every agent dispatch from it. Where the file lives is your
business. There must be exactly one. It must be version controlled, not pasted
from memory. Any place that shows it must read the same content, not a copy
that can drift.

A dispatch command carries these fields, in this shape:

- task
- repo
- model
- effort
- scope
- constraints
- verify steps
- stop condition

The shape is the point. One model writes a command. Another model picks it up
on another day. It still lands in the same form. It can be pasted and run cold.

## Using the quick squeeze in a product

This section is not normative. It says what a product setting for the quick
squeeze means. Two products that offer one then mean the same thing.

A product MAY offer a setting named "quick squeeze". It is on by default.

- On: the K13 pass is shown. This is the quick squeeze, written once, in the
  report shape above when the work is a report.
- Off: the product shows its own normal answer, and still shows the AiEDs cost
  line.

What the product's own normal answer looks like is the product's business. K13
does not require it, check it or rate it. The cost line stays because step 2 is
a rule about cost, not about style. Turning the quick squeeze off changes how
the answer is written. It never changes whether its cost is shown.

## What changed from 2.x

K13 2.x had six response levels. They were juice box, soda pop, energy drink,
black coffee, loose leaf and yerba mate. An answer was written six times and a
reader picked one. K13 3.0.0 keeps one of them.

- A 2.x juice box pass conforms to 3.0.0 unchanged. It must also meet the
  limits above and state its confidence. It was already the same text.
- The other five passes are not part of the standard. A product may still offer
  them. K13 does not require them and does not check them.
- The ladder, the level names for storage, the level icons and the file
  `k13-levels.json` are gone. So are the default-level rules.
- Steps 9 to 12.2 are replaced by steps 9 to 12. They make and check the one
  pass. There are still thirteen steps, so the name K13 is still true.

The reason is in the changelog. In short, a standard has no business training
readers to climb a ladder. One short pass was the part that was ever checked.

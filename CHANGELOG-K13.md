# K13 changelog

What changed in each version of K13, in plain words. The standard is `K13.md`.

## 4.1.0

Owner decision, 2026-10-27: the voice helps clarity more than a count does.

- Voice: new. Write like a calm adult explaining to a smart caveman. Smart
  caveman means simple words, not broken grammar. The facts and the numbers
  stay exactly true. A technical word is fine once, if the same sentence
  explains it. No inside jokes.
- Removed: the letter limit on a word, the word limit on a sentence and the
  limit on the average sentence. They are gone from the quick squeeze, from
  step 10 and from the gate.
- Step 10 is now "Cut it in the voice". The hype word ban stays. The whole
  answer ceilings stay: 40 words in the opening, 400 in the body.
- Step 8 now carries the humor rules: at most one dry joke. Humor is off for
  money, safety, security, privacy, legal, tax, loss, errors the user did not
  cause, and a frustrated user. Never attach a joke to a number. If the
  sentence reads better without the joke, drop it.
- Gate check 3 is now "No hype word". Gate check 4 is retired. Its number is
  kept, so checks 5 to 13 keep theirs and a conformance line still reads
  "gate checks 1 to 13". Check 4 always passes.
- The reference: "The limits, in full" becomes "The voice, in full". The humor
  rules gain two lines: drop a joke the sentence reads better without, and no
  inside jokes.

### What changes for a 4.0.0 conformance claim

This is a MINOR bump. The gate only got looser. Every answer that passed 4.0.0
passes 4.1.0, so a 4.0.0 claim still holds.

- A tool that reads `LIMITS.longestWord`, `LIMITS.longestSentence` or
  `LIMITS.averageSentence` from `@randomknights/k13` gets `undefined` at
  4.1.0. `LIMITS` now holds the ceilings only.
- `checkSentences` is removed from the checker. A finding named `sentences`
  never appears. `checkPlainWords` reads hype words only.
- A report checked at 4.1.0 can pass where 4.0.0 failed it on a long word or a
  long sentence. The voice rules are held by a person, not by the gate.

## 4.0.0

- Scope: K13 is a RESPONSE standard, not a report standard. It governs every
  answer, in a chat or a terminal.
- Modes: new. ANSWER MODE is the default and covers every response. It carries
  no tiles, no headings on a short answer and no file. REPORT MODE applies only
  when a report or a document was asked for, and it carries the required tiles.
- Answer size: new. The opening is 40 words or fewer. Outside data, the body is
  400 words or fewer. Anything longer goes in a linked artifact.
- The ceiling governs an ANSWER or a REPORT. It does NOT govern reference text:
  `K13.md`, `K13-REFERENCE.md`, this changelog, or any other spec page.
- Tiles: twelve becomes THREE required, in this order: what happened, what it
  cost, what is next. The other nine stay defined and are optional.
- Voice: new, "The first pass". The first sentence names the thing in words a
  beginner knows, with no term of art. It gives one everyday comparison. The
  tone is friendly. The humor never lands on a failure, a number, a cost or a
  risk.
- Where the answer lives: new. The answer goes in the reply. A file is written
  only when the reader asked for one.
- No unrequested artifacts: new. No document, summary file, temp file, plan
  file or note for human review, unless the reader asked for it. A work product
  is the task and is not covered. Code, config, tests, fixtures, schemas and
  migrations are written as normal.
- Verify before asserting: new. A claim about state carries its evidence or
  says it is unverified. A green check is not evidence of behavior.
- New section, "No contradiction, no restatement". Do not hedge the answer
  away, and do not summarize a short answer.
- Precision matches confidence: new. Low, or a class estimate, supports two
  significant figures. Moderate supports three.
- Voice: bluntness is required, not allowed. Bad news goes in the first
  sentence, with no soft preamble.
- Gate: nine checks becomes thirteen. Check 7 now reads the three required
  tiles. Checks 10, 11 and 12 read the opening ceiling, the body ceiling and
  the term of art rule. Check 13 reads the precision of a figure against the
  stated confidence.
- Not gated, on purpose: the everyday comparison, the humor and the tone. Nor
  is where the answer lives, whether an artifact was asked for, or whether the
  answer restates itself. The gate table says so in the document itself.
- No planetary figure is required anywhere in a K13 answer. That hook is on
  request only (owner, 2026-10-23).

### What breaks for a 3.0.0 conformance claim

This is a MAJOR bump because a conformance claim changes meaning.

- A line that reads "conforms to K13 3.0.0, quick squeeze, gate checks 1 to 9"
  does not carry to 4.0.0. Thirteen checks exist now. That line names nine of
  thirteen, so re-run the gate and state it as 1 to 13.
- A product that applied K13 to reports only now applies it to every response.
  That is the largest behavior change in this version.
- A 3.0.0 report PASSES 4.0.0 only if it also fits the ceiling and opens
  without a term of art. A long report that was green at 3.0.0 can go red.
- A 3.0.0 report that filled all twelve tiles still conforms. Nothing has to be
  deleted from it.
- A tool that checked "the twelve tiles, in order" is now WRONG in two ways. It
  demands nine optional tiles, and it reads the old order. The required three
  come first: finding, AiEDs disclosure, what's next.
- The tile ORDER changed with the cut. A stored template, stylesheet or parser
  keyed to the 3.0.0 order needs updating. The reference templates in
  `templates/` were updated here.
- The checker is the same package at a new version. `@randomknights/k13` 4.0.0
  reads thirteen checks out of `K13.md`. It can fail a report 3.0.0 passed.
- A cost line that prints a class estimate to five or seven figures now fails
  check 13. Round the figure to what its confidence supports.

## 3.0.0

- Steps: still thirteen. Steps 9 to 12 now make and check one answer, the quick squeeze.
- Those four steps are: draft it, cut it to the limits, source every figure, state the confidence.
- Gate: nine checks for one answer. They add word and sentence limits and a cost line, and they check that each figure has a source.
- Tiles: still twelve, in the same order. The verdict tile now carries its confidence.
- Also new: a short "using the quick squeeze in a product" note, and a companion reference file.

Versions 1 and 2 asked for several passes of one answer. Version 3 asks for one.

### Migrating

A 2.x juice box pass conforms to 3.0.0 unchanged. It must also meet the limits and state its confidence.
Any other pass from 2.x is not part of the standard. A product may keep offering it. K13 neither requires nor checks it.
Do not rename a value your product already stores to match this document.

## 2.2.0

- Steps: wording clean-up. Step 9 named the default pass.
- Gate: six checks, plus the "What's next" model-name check. Test vectors for each check.
- Tiles: unchanged.

## 2.1.0

- Added a worked example and a section on canonical text and mirrors. No rule changed.

## 2.0.0

- Steps: thirteen, with six drafting passes inside steps 9 to 12.
- Gate: six checks.
- Tiles: twelve, including "How it fits" and "What's next". Evidence blocks must carry their real result.

## 1.1.0 and earlier

- Four drafting passes. Superseded by 2.0.0.

## Where the older text is

The full text of version 2.2.0 is in git history at commit `8255ca42` on `main`.
It will also sit under the tag `k13-v2.2.0`.

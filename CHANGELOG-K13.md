# K13 changelog

Full version history of K13, newest first. The standard is `K13.md`.

Terminology: through 2.1.0 this document said "learning levels" in headings
and labels, and "reading levels" in prose. From 2.2.0 it said "response
levels". From 3.0.0 there is one pass, the quick squeeze, and no levels.
Entries below keep the words in use when they were written.

### 3.0.0

BREAKING for anything that wrote or checked the six passes. A 2.x juice box
pass conforms unchanged. It must also meet the new limits and state its
confidence.

Why. The six-level ladder asked every report to be written six times and
checked six times. It was there to teach a reader to pick a rung. K13 is not in
the business of training readers or models. The juice box pass was the default,
and it was the one most readers wanted. So the standard now asks for that one,
short and plain, and checks that.

Removed from the standard:

- The six response levels and the ladder table. Only the juice box pass
  remains, under the name "quick squeeze".
- Steps 9, 10, 11, 12, 12.1 and 12.2 as six drafting passes.
- The level icons, the rule about text for those icons, and the rules for
  level names and labels.
- The level identifiers and the old `vending_machine` exception.
- The levels data file. `k13-levels.json` is no longer made or served.
- "The default level" and "Extending the ladder".
- "One fact, six ways" and "How to hit any response level". They are replaced
  by "One fact, one pass" and "How to hit the quick squeeze".
- The six-level wording of "Short work", "Structural invariance" and "Evidence
  blocks". The twelve-tile shape and the evidence rule stay. They no longer
  need to agree across levels, because there is one.
- The gate checks that compared passes with each other. These were number
  agreement across levels, verdict and confidence at every level, and the same
  tiles at every level.

Added or changed:

- New section "The quick squeeze", with numeric limits a program can check. No
  word over 12 letters. No sentence over 20 words. An average sentence of 14
  words or fewer. Each sits above the longest juice box passage in the 2.x
  examples. Those measure 8 letters, 16 words and 11.1 words on average.
- New section "What changed from 2.x".
- Steps 9 to 12 now make and check the one pass. Draft it, cut it to the
  limits, source every figure, state the confidence. Step 13 is the gate, as
  before. Steps 1 to 8 are unchanged. There are still thirteen steps.
- The machine gate is nine checks for one pass. They are listed in "The
  machine gate". The old seventh check, no model name in What's next, is now
  check 9.
- The verdict tile carries its confidence.
- New sections "Using the quick squeeze in a product", "What the gate cannot
  check" and "What K13 does not claim". This page is rewritten in the quick
  squeeze voice, and a test holds it to its own limits.
- The stated conformance line is now "conforms to K13 3.0.0, quick squeeze,
  gate checks 1 to 9".

Migrating from 2.x:

- A report written at six levels: keep the juice box text as the pass. Check it
  against the limits. Add the confidence sentence if it has none. Drop the
  other five passes from the report, or keep them as product features outside
  the standard.
- A product with a level picker: the picker is yours to keep or retire. K13
  asks only for the quick squeeze. A stored level of `juice_box` maps to the
  quick squeeze being on. The other five stored values have no K13 meaning.
  What a product does with them is its own decision. Do not rename a stored
  value, or the box it lives in, to match this document.
- A checker that read `k13-levels.json`: the file is gone. Read the version
  from `K13.md` or from `versions.json`.
- A gate that ran checks 1 to 6 of 2.x: run it again against checks 1 to 9
  above. A report that passed the 2.x gate may not pass the new limits.

Version 2.2.0 stays citable as published. It is not withdrawn. A report that
says it conforms to K13 2.2.0 is making a true statement about 2.2.0. Cite the
version you adopted.

### 2.2.0

Wording, the long name, and the default level. A 2.1.0 report conforms to 2.2.0
unchanged, because every report already carries all six levels. No step number,
count, level name, reserved name or icon changes. One implementation rule
changes: the default level, described below.

- The long name is "Ai General Response Standard". The short name K13 is
  unchanged. It was "AI Response Standard".
- The default response level is now juice box. It was energy drink. Step 9 now
  carries the default rule that step 11 carried, and the new section "The
  default level" states what it means for pickers, reports, agents and saved
  choices. A remembered pick still wins, and no stored level identifier is
  renamed, so no saved choice resets.

- The six levels are named "response levels": the same answer, adjusted to the
  reader's preference. "Learning level" and "reading level" are retired as
  names for them, because the levels do not teach and do not rate the reader.
- Section "The learning level ladder" is now "The response levels", and "How to
  hit any learning level" is now "How to hit any response level". The anchors
  `#the-learning-level-ladder` and `#how-to-hit-any-learning-level` become
  `#the-response-levels` and `#how-to-hit-any-response-level`. The "Rule
  carried here" labels at steps 9 to 12 now read "(response level)".
- New heading "The standard at a glance" over the opening paragraph that sat
  under "Canonical text and mirrors".
- Step 7 pointed at `docs/command-templates.md`, a path that is not in this
  repository. It now points at the "Command template library" section.
- Plainer wording in the opening, scope and levels sections: repeated
  explanations removed and each term defined once. No requirement was changed
  by this.
- "One fact, six ways" now states the version numbers its closing paragraph
  says every pass names.
- "One fact, six ways" is rewritten so it passes machine gate checks 1 and 2
  itself. It had a figure at two levels only ("four repositories") and a
  confidence statement at one level only, so by its own gate it was not clean.
  Every pass now carries the same four figures, the same verdict, the same
  confidence and the same provenance. The package's tests read the six passes
  out of this document and run checks 1 and 2 on them.
- New section "Level identifiers": a machine-readable identifier for each
  level (`juice_box` and so on), as a recommendation, with the 1.1.0 exception written
  down: soda pop persists as `vending_machine`. The stored legacy box name
  `reading_level_prefs` is untouched. Names and identifiers stay English;
  labels may be localized.
- A PASS is defined once, as the written text of one answer at one response
  level. Both "pass" and "level" stay normative.
- Every rendered glyph must have a text alternative: the level name, never the
  Unicode character name. How a screen reader reads a level is stated.
- New subsection "Test vectors": a passing and a failing six-level vector per
  machine gate check, shipped in `@randomknights/k13`. A vector illustrates a
  check and the numbered list wins on disagreement.
- New subsection "Stating conformance": an optional one-line statement,
  "conforms to K13 2.2.0, six response levels, gate checks 1 to 6".
- New data file `k13-levels.json`, generated from this document at site build
  time, so the ladder has one source.
- The package checker implements machine gate checks 1, 2 and 3 for the passes
  of a report, and a glyph text alternative check for HTML. Checks 1 to 6 of
  the gate itself are unchanged; this is implementation, not a new rule.
- Counts of the capitalized normative keywords, each counted on its own with
  "must not" apart from "must": must not 2 (was 1), must 3 (was 1), should 3
  (was 1), may 3 (was 2). The additions are one must (glyph text alternative),
  one must not (renaming a stored value), one must (names stay English), two
  should (identifiers, the legacy mapping) and one may (conformance statement).
- Deferred, not in this version: worked examples for each of the twelve tiles
  (not just the finding sentence). They risk reading as a detail ladder and are
  a large body of text; this is recorded here so the question is not lost.
- Kept as is by owner decision: the phrase "deep dive" in the definition of a
  response level, the education grade labels in the ladder table, and juice box
  as the default level.

### 2.1.0

Additive. A 2.0.0 report conforms to 2.1.0 unchanged, and no rule changes.

- New section "One fact, six ways": one real fact written at all six normative
  levels, so an implementer can see the reading ladder and the detail ladder
  side by side rather than inferring the difference from the prohibition. The
  rule it illustrates is unchanged. The example was written because the field
  drift 2.0.0 describes kept recurring in implementations that had read the
  rule and agreed with it.
- New section "Canonical text and mirrors", and a "Canonical text" line in the
  header. This file is the one authoritative text; every other copy is a mirror
  with no authority, a mirror states the version it carries, and the published
  artifacts a mirror can be checked against are named. Nothing here is new
  policy: the repository already served the canonical text and the version data
  at fixed addresses. What is new is that the standard says so in its own text,
  so a mirror carries the statement that it is a mirror.

### 2.0.0

BREAKING. A 1.1.0 report with four levels does not conform to this version.

- All SIX levels are normative. Loose leaf and yerba mate are promoted from
  RESERVED to required, they carry step numbers 12.1 and 12.2, and they get the
  same definition treatment the other four get. Every "four passes" in this
  document is now six.
- The ladder is stated to be a READING-LEVEL ladder: all six passes carry the
  same facts, figures, verdicts and confidence, and an implementation that adds
  figures as the level rises has built a detail ladder, which fails step 13 by
  construction.
- New section "Scope: when K13 applies". K13 is for work that produces a
  report. Applying the thirteen steps to a one-line answer, a conversational
  reply or a tool call is a misapplication, not a stricter reading.
- New section "The machine gate": the six checks an implementation runs before
  a K13 report ships, and the rule that a gate which has never failed is not a
  gate.
- New section "The report template": the ordered twelve-tile list a conforming
  report carries, plus a pointer to the reference templates now in this
  repository at `templates/`.
- Two of those tiles are new. "How it fits" says what plan or lane the work
  belongs to, what it unblocks, and what preceded it. "What's next" carries the
  role, the effort and a paste-ready command for the continuation, never a model
  name unless a published mapping is cited, and "No next step, this work is
  complete" is always a valid answer.
- New section "Structural invariance": the report shell is identical at every
  level and only the register changes. The 1.1.0 template taught the opposite by
  putting the checks table, the query block and the open questions at one level
  each, which is the mechanism behind the detail-ladder drift observed in the
  field.
- New section "Evidence blocks": every command or query appears with its real
  rendered result, results are never fabricated or quietly shortened, and
  evidence is invariant across all six levels.
- The dash rule at step 13 now forbids "--" as a dash surrogate, and names the
  replacements: a comma, a colon, or a new sentence.
- Step 11 names energy drink as the level a picker opens on when the reader has
  not chosen one.
- The step numbering is restated rather than extended: the standard is still
  thirteen steps, and the two new passes are numbered inside the step 12
  drafting block.

### Migrating from 1.1.0

A 1.1.0 report has four levels. To conform to 2.0.0 it adds a loose leaf pass
and a yerba mate pass carrying the same facts, the same figures, the same
verdicts and the same confidence as the other four. Nothing in the four
existing passes has to be rewritten: if they already agreed with each other,
they already agree with the two new ones once the new ones are written from the
same facts. An implementation that treated loose leaf and yerba mate as
reserved names now writes them.

Version 1.1.0 remains citable as published. It is not withdrawn, and a report
that states it conforms to K13 1.1.0 is making a true statement about 1.1.0.
Cite the version you adopted.

### 1.1.0

- Level 2 is renamed from "vending machine" to "soda pop". The storage
  identifier behind it is deliberately NOT renamed in implementations that
  already persist a reader's choice: renaming it would silently reset every
  saved level. The name is what the reader sees; the identifier is not.
- Two reserved expert levels are added above black coffee, loose leaf and
  yerba mate. They are reserved names and glyphs, not reading levels, and they
  carry no step number. The standard remains thirteen steps.
- Each of the four passes now names its icon by Unicode codepoint, so the
  icons are normative while this document stays ASCII.
- The opening line is clarified: thirteen steps every time does not mean
  thirteen units of work every time. It already said so further down, and now
  it says so where a reader meets it.
- The command template library section no longer names private repositories,
  an internal collection path or an internal publish page. The normative
  content, the field list and the one-canonical-copy requirement, is kept.

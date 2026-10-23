// Tests for @randomknights/k13. Not shipped in the package.
//
// K13 says a gate that has never failed is not a gate, so every check this
// package implements is shown passing on the reference templates and a filled
// report, and then failing on a planted defect.
//
// K13 3.0.0 replaced the six response levels with one pass, the quick squeeze.
// The tests that pinned six levels, the level identifiers, the levels registry
// and the glyph text alternatives were removed with them: the rules they held
// are no longer in the standard.
//
// K13 4.0.0 cut the twelve mandatory tiles to three required ones, added the
// whole-answer ceiling (checks 10 and 11) and the first-pass voice rule
// (check 12). The tile list still has twelve entries, so this file pins the
// COUNT, the ORDER and which three are REQUIRED, and it pins a minimal report
// of three tiles passing where 3.0.0 would have failed it nine times.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  K13_VERSION,
  LIMITS,
  PRECISION,
  REQUIRED_TILES,
  TERMS_OF_ART,
  TILES,
  checkBody,
  checkConfidence,
  checkFirstPass,
  checkOpening,
  checkPrecision,
  dottedNumbers,
  checkDashes,
  checkFigures,
  checkFile,
  checkPassage,
  checkPlainWords,
  checkSentences,
  checkText,
  exampleQuickSqueeze,
  extractFigures,
  loadVectors,
  runVector,
  sentencesOf,
  statedConfidence,
} from "../src/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const cli = join(here, "..", "bin", "k13.mjs");
const mdTemplate = readFileSync(join(repoRoot, "templates/temp1ate.md"), "utf8");
const htmlTemplate = readFileSync(join(repoRoot, "templates/temp1ate.html"), "utf8");
const filledMd = readFileSync(join(here, "..", "vectors/filled-pass.md"), "utf8");
const filledHtml = readFileSync(join(here, "..", "vectors/filled-pass.html"), "utf8");

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

test("the version, limits and tiles come from K13.md", () => {
  const k13 = readFileSync(join(repoRoot, "K13.md"), "utf8");
  assert.ok(k13.includes(`**Version:** ${K13_VERSION}`));
  assert.equal(K13_VERSION, "4.0.0");
  assert.deepEqual(LIMITS, {
    longestWord: 12,
    longestSentence: 20,
    averageSentence: 14,
    openingWords: 40,
    bodyWords: 400,
  });
  assert.equal(TILES.length, 12);
});

test("three tiles are required, in the order K13.md gives them", () => {
  assert.deepEqual(
    REQUIRED_TILES.map((t) => t.tile),
    ["finding", "aieds-disclosure", "whats-next"],
  );
  // The other nine stay DEFINED, and stay in the canonical order after them.
  assert.deepEqual(
    TILES.filter((t) => !t.required).map((t) => t.tile),
    [
      "header-strip",
      "verdict-row",
      "how-it-fits",
      "environment-card",
      "checks-table",
      "evidence-blocks",
      "discrepancies",
      "owner-actions",
      "what-was-not-done",
    ],
  );
});

test("the terms of art of check 12 come from K13.md", () => {
  const k13 = readFileSync(join(repoRoot, "K13.md"), "utf8");
  assert.ok(TERMS_OF_ART.length >= 5);
  for (const term of TERMS_OF_ART) assert.ok(k13.includes(`\`${term}\``), term);
  assert.ok(TERMS_OF_ART.includes("ruleset"));
});

test("a report of only the three required tiles passes every check", () => {
  // The point of 4.0.0, as a document: nine tiles are gone and nothing is red.
  const r = checkFile(join(here, "..", "vectors/minimal-pass.md"));
  assert.deepEqual(r.findings, []);
});

test("the ceiling and the first pass are checked on an answer, not on the standard", () => {
  // K13.md and K13-REFERENCE.md are reference text. 4.0.0 exempts them by
  // name, and the code does it by only measuring a parsed report.
  for (const f of ["K13.md", "K13-REFERENCE.md", "CHANGELOG-K13.md"]) {
    const r = checkFile(join(repoRoot, f));
    assert.deepEqual(r.findings, [], f);
    assert.deepEqual(r.ran, ["dash"], f);
  }
  assert.equal(checkOpening("Six copies of the rules are old.").length, 0);
  const long = Array(45).fill("word").join(" ") + ".";
  assert.match(checkOpening(long)[0].message, /the ceiling is 40/);
  assert.match(checkBody(Array(401).fill("word").join(" ") + ".")[0].message, /the ceiling is 400/);
  assert.deepEqual(checkFirstPass("The rules are old."), []);
  assert.match(checkFirstPass("The ruleset is old.")[0].message, /term of art "ruleset"/);
  // A term of art inside a longer word is not a term of art.
  assert.deepEqual(checkFirstPass("The rulesets were canonicalized."), []);
  // Only the FIRST paragraph is held to it.
  const NL2 = String.fromCharCode(10, 10);
  assert.deepEqual(checkFirstPass(`The rules are old.${NL2}The ruleset says so.`), []);
});

test("precision: a figure may not out-run its stated confidence", () => {
  assert.deepEqual(PRECISION, { low: 2, moderate: 3 });
  // The live defect: a class estimate printed to seven figures.
  const bad = checkPrecision("| gCO2e | 366.5105 |", "low");
  assert.match(bad[0].message, /7 significant figures/);
  assert.deepEqual(checkPrecision("| gCO2e | 370 |", "low"), []);
  assert.deepEqual(checkPrecision("| gCO2e | 0.37 |", "low"), []);
  assert.deepEqual(checkPrecision("| gCO2e | 0.371 |", "moderate"), []);
  assert.equal(checkPrecision("| gCO2e | 0.3712 |", "moderate").length, 1);
  // A version is not a figure, and neither is a high-confidence measurement.
  assert.deepEqual(checkPrecision("methodology 2.1.0", "low"), []);
  assert.deepEqual(checkPrecision("| gCO2e | 366.5105 |", "high"), []);
  // A class estimate reads as low, whatever level it claims.
  assert.equal(statedConfidence("provenance class-estimated, confidence high", ""), "low");
  assert.equal(statedConfidence("| confidence | moderate |", ""), "moderate");
  assert.equal(statedConfidence("", "nothing stated"), null);
  // The figure scan is a character walk, not a backtracking pattern. CodeQL
  // flagged the first spelling of it as polynomial on a long run of zeros
  // (2026-10-23), and this checker reads files it did not write.
  const zeros = `${"0".repeat(200000)}.${"0".repeat(200000)}`;
  const t0 = Date.now();
  checkPrecision(zeros, "low");
  assert.ok(Date.now() - t0 < 2000, "the precision check took too long");
  assert.deepEqual(
    dottedNumbers("a 1.2.3 b 4.5 c 6").map((d) => d.figure),
    ["1.2.3", "4.5", "6"],
  );
});

test("K13.md defines the two modes and the rules an answer-mode reply follows", () => {
  const body = readFileSync(join(repoRoot, "K13.md"), "utf8");
  // 4.0.0 made K13 a response standard. A model reads this file as its rule,
  // so each rule has to be in it, not behind a link to the reference.
  for (const phrase of [
    "answer | every response, by default",
    "## No unrequested artifacts",
    "## Verify before asserting",
    "## No contradiction, no restatement",
    "## Precision matches confidence",
    "## Where the answer lives",
    "Bluntness is required",
    "The report template, in report mode",
  ]) {
    assert.ok(body.includes(phrase), `K13.md no longer says "${phrase}"`);
  }
  // Work products are not artifacts about the work. Saying so stops an agent
  // reading the rule as "write no files" and refusing the task itself.
  assert.match(body, /WORK PRODUCTS are the task/);
  // The Earth+ hook is on request only (owner, 2026-10-23): K13 names no
  // planetary figure at all.
  assert.doesNotMatch(body, /Earth\+|planetary/i);
});

test("K13.md no longer defines response levels, identifiers or a levels file", () => {
  const body = readFileSync(join(repoRoot, "K13.md"), "utf8");
  // The words survive only in the one line that says what changed in 4.0.0.
  const rest = body
    .split(String.fromCharCode(10))
    .filter((l) => !l.startsWith("Changed in 4.0.0:"))
    .join(String.fromCharCode(10));
  assert.ok(rest.length < body.length, "the one-line 'Changed in 4.0.0' note is gone");
  assert.doesNotMatch(rest, /response level/i);
  assert.doesNotMatch(rest, /k13-levels/);
  assert.doesNotMatch(rest, /soda pop|energy drink|black coffee|loose leaf|yerba mate/);
  assert.doesNotMatch(rest, /^\d+\.\d+ /m, "a numbered sub-step such as 12.1 is back");
});

test("the thirteen steps are numbered 1 to 13, with no sub-steps", () => {
  const body = readFileSync(join(repoRoot, "K13.md"), "utf8");
  const start = body.indexOf("\n## The thirteen steps");
  const end = body.indexOf("\n## ", start + 5);
  const numbers = body
    .slice(start, end)
    .split("\n")
    .map((l) => /^(\d+)\. /.exec(l))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

test("the reference templates and a filled document pass; K13.md passes the dash check", () => {
  for (const f of ["templates/temp1ate.md", "templates/temp1ate.html", "K13.md"]) {
    const r = checkFile(join(repoRoot, f));
    assert.deepEqual(r.findings, [], f);
  }
  const t = checkText(mdTemplate, "md");
  assert.ok(t.ran.includes("structure"));
  assert.equal(t.skipped.length, 1, "an unfilled template says its content checks were skipped");
  for (const [text, format] of [
    [filledMd, "md"],
    [filledHtml, "html"],
  ]) {
    const r = checkText(text, format);
    assert.deepEqual(r.findings, [], format);
    assert.deepEqual(
      r.ran,
      [
        "dash",
        "structure",
        "evidence",
        "whats-next",
        "figures",
        "confidence",
        "plain-words",
        "sentences",
        "cost-line",
        "ceiling-headline",
        "ceiling-body",
        "first-pass",
        "precision",
      ],
    );
  }
});

test("dash: em dash, en dash and a double-hyphen surrogate fail", () => {
  assert.equal(checkDashes(`a ${EM_DASH} b`)[0].message, "em dash");
  assert.equal(checkDashes(`1${EN_DASH}2`)[0].message, "en dash");
  assert.equal(checkDashes("done -- next")[0].message, "double hyphen used as a dash");
  assert.equal(checkDashes("-- leading")[0].line, 1);
  // Not dashes: a flag, a table rule, a lane id, a quoted mention, code.
  const notDashes = [
    "git log --oneline",
    "| --- |",
    "root--pm-0908",
    'the "--" surrogate',
    "use `a -- b` here",
    "```",
    "x -- y",
    "```",
  ].join("\n");
  assert.deepEqual(checkDashes(notDashes), []);
});

test("figures: spelled numbers and digits are the same figure", () => {
  assert.deepEqual([...extractFigures("six of 6 and Four, version 3.0.0")].sort(), ["3.0.0", "4", "6"]);
  assert.deepEqual([...extractFigures("one of the copies")], []);
});

test("figures: an untraced figure fails, a derived one passes, a derived one with a bad input fails", () => {
  assert.equal(checkFigures("We ran 7 checks.", ["6"]).length, 1);
  assert.deepEqual(checkFigures("We ran 6 checks.", ["6"]), []);
  const derived = "Eight ran. Derived: 8 from 5 and 3 by adding them.";
  assert.deepEqual(checkFigures(derived, ["5", "3"]), []);
  const bad = checkFigures(derived, ["5"]);
  assert.ok(bad.some((f) => /comes from "3"/.test(f.message)));
  // A chain: a derived figure may feed a later one.
  const chain = "Derived: 8 from 5 and 3 by adding them. Derived: 4 from 8 by halving it. Four ran.";
  assert.deepEqual(checkFigures(chain, ["5", "3"]), []);
});

test("confidence: a level word and a reason are both needed", () => {
  assert.deepEqual(checkConfidence("Confidence is high, because we read each one."), []);
  assert.deepEqual(checkConfidence("**confidence:** moderate, because we searched four places."), []);
  assert.equal(checkConfidence("We are sure.").length, 1);
  assert.equal(checkConfidence("Confidence is high.").length, 1);
});

test("plain words: the letter limit and the hype list", () => {
  assert.equal(checkPlainWords("We checked interoperability today.").length, 1);
  assert.deepEqual(checkPlainWords("We checked `interoperability` today."), []);
  assert.deepEqual(checkPlainWords('The term "interoperability" is defined here.'), []);
  assert.deepEqual(checkPlainWords("See https://example.org/interoperability-guidelines for it."), []);
  assert.deepEqual(checkPlainWords("A twelve-letter word, verification, is allowed."), []);
  assert.equal(checkPlainWords("An unlock for the team.").length, 1);
  assert.equal(checkPlainWords("We use it prior to the run.").length, 1);
});

test("sentences: the word limit and the average", () => {
  const short = "It is so. It is so. It is so.";
  const twenty = Array(20).fill("word").join(" ") + ".";
  assert.deepEqual(checkSentences(`${twenty} ${short}`), []);
  assert.equal(checkSentences(`${Array(21).fill("word").join(" ")}. ${short}`).length, 1);
  const eighteen = `Word ${Array(17).fill("word").join(" ")}.`;
  const avg = checkSentences(`${eighteen} ${eighteen} ${eighteen}`);
  assert.equal(avg.length, 1);
  assert.match(avg[0].message, /average/);
  assert.equal(sentencesOf("One. Two words here.\n\n- A list item.\n- Another one.").length, 4);
});

test("structure: a REQUIRED tile missing from the markdown report fails", () => {
  const r = checkText(filledMd.replace("### What's next", "### Something else"), "md");
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.check === "structure" && /What's next/.test(f.message)));
});

test("structure: an OPTIONAL tile missing is not a finding in 4.0.0", () => {
  const r = checkText(filledMd.replace("### Discrepancies", "### Something else"), "md");
  assert.deepEqual(r.findings.filter((f) => f.check === "structure"), []);
});

test("structure: html tiles out of order fail", () => {
  const planted = filledHtml
    .replace('data-tile="finding"', 'data-tile="__swap__"')
    .replace('data-tile="verdict-row"', 'data-tile="finding"')
    .replace('data-tile="__swap__"', 'data-tile="verdict-row"');
  assert.ok(checkText(planted, "html").findings.some((f) => f.check === "structure"));
});

test("structure: other passes in a 2.x report are not checked and do not fail it", () => {
  const withOld = `${filledMd}\n---\n\n## soda pop\n\nAn old 2.x pass that carries nothing else.\n`;
  assert.deepEqual(checkText(withOld, "md").findings, []);
});

test("evidence: a command with no result fails, in html and in markdown", () => {
  const h = checkText(filledHtml.replace('class="ev-result"', 'class="ev-nothing"'), "html");
  assert.ok(h.findings.some((f) => f.check === "evidence"));
  const m = checkText(filledMd.replace("Result:\n\n```\n6\n```\n", ""), "md");
  assert.ok(m.findings.some((f) => f.check === "evidence"));
});

test("whats-next: a model name fails; the completion answer stands in for a role", () => {
  const model = checkText(filledMd.replace("| role | builder |", "| role | opus builder |"), "md");
  assert.ok(model.findings.some((f) => /names a model/.test(f.message)));
  const done = filledMd.replace(
    /### What's next[\s\S]*?### Owner actions/,
    "### What's next\n\nNo next step, this work is complete. The check is done.\n\n### Owner actions",
  );
  assert.deepEqual(checkText(done, "md").findings.filter((f) => f.check === "whats-next"), []);
});

test("cost line: energyKWh and gCO2e each need a figure or not reported", () => {
  const ok = checkText(filledMd.replace("| gCO2e | not reported |", "| gCO2e | 0.4 |"), "md");
  assert.deepEqual(ok.findings, []);
  const bad = checkText(filledMd.replace("| gCO2e | not reported |", "| gCO2e | |"), "md");
  assert.ok(bad.findings.some((f) => f.check === "cost-line" && /gCO2e/.test(f.message)));
});

test("content: a report with an untraced figure in its prose fails check 1", () => {
  const planted = filledMd.replace("Six copies of the rules are old.", "Seven copies of the rules are old.");
  assert.ok(checkText(planted, "md").findings.some((f) => f.check === "figures" && /"7"/.test(f.message)));
});

test("a plain document runs only the dash check and says so", () => {
  const r = checkText("A plain note.", "md");
  assert.equal(r.ok, true);
  assert.deepEqual(r.ran, ["dash"]);
  assert.equal(r.skipped.length, 1);
});

test("cli: exit 0 on a pass, 1 on a finding, 2 on bad usage", () => {
  const dir = mkdtempSync(join(tmpdir(), "k13-"));
  const good = join(dir, "good.md");
  const bad = join(dir, "bad.md");
  writeFileSync(good, "All clear.\n");
  writeFileSync(bad, `Not clear ${EM_DASH} at all.\n`);
  const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: "utf8" });
  assert.equal(run("check", good).status, 0);
  const r = run("check", bad);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /bad\.md:1: dash: em dash/);
  assert.equal(run("check").status, 2);
  assert.equal(run("check", join(dir, "missing.md")).status, 2);
  const j = JSON.parse(run("check", "--json", bad).stdout);
  assert.equal(j.results[0].ok, false);
});

test("evidence: a hostile file cannot make the check slow", () => {
  const hostile =
    '<div id="quick-squeeze"><div data-tile="evidence-blocks">' +
    '<div class="evidence">a'.repeat(50000) +
    '<div data-tile="discrepancies"></div></div>';
  const t0 = Date.now();
  checkText(hostile, "html");
  assert.ok(Date.now() - t0 < 2000, "the evidence check took too long");
});

test("vectors: every gate 1 to 13 has a passing and a failing vector, and each behaves", () => {
  const vectors = loadVectors();
  for (let gate = 1; gate <= 13; gate += 1) {
    for (const expect of ["pass", "fail"]) {
      assert.ok(
        vectors.some((v) => v.gate === gate && v.expect === expect),
        `no ${expect} vector for gate ${gate}`,
      );
    }
  }
  for (const v of vectors) {
    const found = runVector(v);
    if (v.expect === "pass") {
      assert.deepEqual(found, [], v.id);
    } else {
      assert.ok(found.length > 0, `${v.id} found nothing`);
      assert.ok(
        found.some((f) => f.message.includes(v.expectMessage)),
        `${v.id}: no finding says "${v.expectMessage}"; got ${JSON.stringify(found)}`,
      );
    }
  }
});

test("vectors: a failing passage vector is named by its own check", () => {
  // A planted defect must be named by the check it is for and by no other
  // content check of the same kind, or the vector teaches the wrong lesson.
  const names = { 1: "figures", 2: "confidence", 3: "plain-words", 4: "sentences", 5: "dash" };
  for (const v of loadVectors().filter((x) => x.expect === "fail" && x.passage !== undefined)) {
    const all = checkPassage(v.passage, v.runFigures).map((f) => f.check);
    assert.ok(all.includes(names[v.gate]), v.id);
  }
});

test("the worked example 'One fact, one pass' passes checks 1 to 5", () => {
  const { passage, runFigures } = exampleQuickSqueeze();
  assert.ok(passage.length > 100, "the passage was not read out of K13.md");
  assert.ok(runFigures.includes("6") && runFigures.includes("4.0.0"));
  assert.deepEqual(checkPassage(passage, runFigures), []);
  // And the example, mutated the way a drifting report drifts, goes red.
  assert.ok(checkPassage(`${passage} It took 3.2 seconds.`, runFigures).some((f) => f.check === "figures"));
  assert.ok(checkPassage(passage.replace(/Confidence is[^.]*\./g, ""), runFigures).some((f) => f.check === "confidence"));
});

test("hostile input: repeated tags, Derived: and spaces cannot make any check slow", () => {
  const hostile = [
    "<pre".repeat(40000),
    "<script".repeat(40000),
    "Derived: ! from ".repeat(20000),
    "confidence ".repeat(20000),
    " ".repeat(200000) + "x",
    "<".repeat(100000),
  ];
  for (const h of hostile) {
    const t0 = Date.now();
    checkText(`## quick squeeze\n\n${h}\n`, "md");
    checkText(`<div id="quick-squeeze"><section data-tile="finding">${h}</section></div>`, "html");
    checkPassage(h, []);
    assert.ok(Date.now() - t0 < 3000, `a hostile input of ${h.length} characters took too long`);
  }
});

// Tests for @randomknights/k13. Not shipped in the package.
//
// K13 says a gate that has never failed is not a gate, so every check this
// package implements is shown passing on the reference templates and then
// failing on a planted defect.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  K13_VERSION,
  LEVELS,
  TILES,
  IDENTIFIERS,
  checkDashes,
  checkFile,
  checkGlyphAlternatives,
  checkGradedValues,
  checkNumberAgreement,
  checkText,
  exampleSixWays,
  extractFigures,
  levelsRegistry,
  loadVectors,
  runVector,
} from "../src/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const cli = join(here, "..", "bin", "k13.mjs");
const mdTemplate = readFileSync(join(repoRoot, "templates/temp1ate.md"), "utf8");
const htmlTemplate = readFileSync(join(repoRoot, "templates/temp1ate.html"), "utf8");

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

test("the version, levels and tiles come from K13.md", () => {
  const k13 = readFileSync(join(repoRoot, "K13.md"), "utf8");
  assert.ok(k13.includes(`**Version:** ${K13_VERSION}`));
  assert.deepEqual(
    LEVELS.map((l) => l.name),
    ["juice box", "soda pop", "energy drink", "black coffee", "loose leaf", "yerba mate"],
  );
  assert.equal(TILES.length, 12);
});

test("the reference templates and K13.md itself pass", () => {
  for (const f of ["templates/temp1ate.md", "templates/temp1ate.html", "K13.md"]) {
    const r = checkFile(join(repoRoot, f));
    assert.deepEqual(r.findings, [], f);
  }
  assert.ok(checkText(mdTemplate, "md").ran.includes("structure"));
  assert.ok(checkText(htmlTemplate, "html").ran.includes("evidence"));
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

test("structure: a tile missing from one markdown level fails", () => {
  const planted = mdTemplate.replace(/### Discrepancies/, "### Something else");
  const r = checkText(planted, "md");
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.check === "structure"));
});

test("structure: a markdown level missing entirely fails", () => {
  const r = checkText(mdTemplate.replace("## yerba mate", "## other"), "md");
  assert.ok(r.findings.some((f) => /missing level "yerba mate"/.test(f.message)));
});

test("structure: html tiles out of order fail", () => {
  const planted = htmlTemplate
    .replace('data-tile="finding"', 'data-tile="__swap__"')
    .replace('data-tile="verdict-row"', 'data-tile="finding"')
    .replace('data-tile="__swap__"', 'data-tile="verdict-row"');
  const r = checkText(planted, "html");
  assert.ok(r.findings.some((f) => f.check === "structure"));
});

test("evidence: a command with no result fails", () => {
  const planted = htmlTemplate.replace('class="ev-result"', 'class="ev-nothing"');
  const r = checkText(planted, "html");
  assert.ok(r.findings.some((f) => f.check === "evidence"));
});

test("whats-next: a model name fails", () => {
  const from = htmlTemplate.indexOf('data-tile="whats-next"');
  const planted =
    htmlTemplate.slice(0, from) +
    htmlTemplate.slice(from).replace(">role<", ">role< opus ");
  const r = checkText(planted, "html");
  assert.ok(r.findings.some((f) => /names a model/.test(f.message)));
});

test("whats-next: a markdown level without the completion answer fails", () => {
  const planted = mdTemplate.replace(/No next step, this\s+work is complete/, "Done");
  const r = checkText(planted, "md");
  assert.ok(r.findings.some((f) => f.check === "whats-next"));
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
    '<div id="pane-juice_box"><div data-tile="evidence-blocks">' +
    '<div class="evidence">a'.repeat(50000) +
    '<div data-tile="discrepancies"></div></div>';
  const t0 = Date.now();
  checkText(hostile, "html");
  assert.ok(Date.now() - t0 < 2000, "the evidence check took too long");
});

test("vectors: every gate 1 to 6 has a passing and a failing vector, and each behaves", () => {
  const vectors = loadVectors();
  for (let gate = 1; gate <= 6; gate += 1) {
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

test("vectors: every level of every vector is the six normative levels", () => {
  for (const v of loadVectors().filter((x) => x.passes)) {
    assert.deepEqual(Object.keys(v.passes), LEVELS.map((l) => l.name), v.id);
  }
});

test("the worked example 'One fact, six ways' passes gate checks 1 and 2", () => {
  const passes = exampleSixWays();
  assert.deepEqual(Object.keys(passes), LEVELS.map((l) => l.name));
  assert.deepEqual(checkNumberAgreement(passes), []);
  const ex = loadVectors().find((v) => v.id === "example-gate-2");
  assert.deepEqual(checkGradedValues(passes, ex.graded), []);
  // And the example, mutated the way the old one was, goes red.
  const detail = { ...passes, "yerba mate": `${passes["yerba mate"]} It took 3 days.` };
  assert.equal(checkNumberAgreement(detail).length, 1);
  const noConfidence = { ...passes };
  for (const k of ["juice box", "soda pop"]) noConfidence[k] = "Six copies are old.";
  assert.ok(checkNumberAgreement(noConfidence).length > 0);
});

test("figures: spelled numbers and digits are the same figure", () => {
  assert.deepEqual([...extractFigures("six of 6 and Four, version 2.0.0")].sort(), ["2.0.0", "4", "6"]);
  assert.deepEqual([...extractFigures("one of the copies")], []);
});

test("identifiers: lowercase name with underscores, soda pop keeps its legacy id", () => {
  for (const l of LEVELS) assert.equal(IDENTIFIERS.get(l.name).id, l.id);
  assert.equal(IDENTIFIERS.get("soda pop").legacy, "vending_machine");
  assert.equal(IDENTIFIERS.get("juice box").legacy, null);
});

test("levels registry: generated from K13.md, six levels, juice box default", () => {
  const r = levelsRegistry();
  assert.equal(r.k13Version, K13_VERSION);
  assert.equal(r.default, "juice_box");
  assert.deepEqual(
    r.levels.map((l) => [l.name, l.step, l.glyph.codepoint]),
    [
      ["juice box", "9", "U+1F9C3"],
      ["soda pop", "10", "U+1F964"],
      ["energy drink", "11", "U+1F9CB"],
      ["black coffee", "12", "U+2615"],
      ["loose leaf", "12.1", "U+1FAD6"],
      ["yerba mate", "12.2", "U+1F9C9"],
    ],
  );
});

test("glyph-alt: a bare glyph fails, a hidden glyph beside its name or a labelled image passes", () => {
  assert.equal(checkGlyphAlternatives('<span>&#x1F9C3;</span> juice box').length, 1);
  assert.equal(checkGlyphAlternatives('<span aria-hidden="true">&#x1F9C3;</span> juice box').length, 0);
  assert.equal(checkGlyphAlternatives('<span aria-hidden="true">&#x1F9C3;</span>').length, 1);
  assert.equal(checkGlyphAlternatives('<span role="img" aria-label="soda pop">&#x1F964;</span>').length, 0);
  assert.equal(checkGlyphAlternatives('<span class="t-icon">&#9749;</span><span>black coffee</span>').length, 1);
  assert.deepEqual(checkGlyphAlternatives("<p>&#169; 2026</p>"), []);
  const r = checkText('<div id="pane-x"></div><span>&#x1F9C3;</span>', "html");
  assert.ok(r.findings.some((f) => f.check === "glyph-alt"));
});

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
  checkDashes,
  checkFile,
  checkText,
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

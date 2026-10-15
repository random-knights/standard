// Gate: the reference report templates in templates/ still render what K13.md
// requires.
//
// WHY THIS EXISTS. K13 2.0.0 added "The report template" to the standard: an
// ordered list of the twelve tiles a conforming report carries, plus
// "Structural invariance", which said every level carries every tile in the
// same order. templates/ is one rendering of that. Nothing compared the two, so
// the list could be reordered in the specification, or a tile dropped from one
// level of the template, and both files would still look fine on their own.
// This test reads the ordered list out of K13.md, not out of a copy of it, and
// checks both templates against it (one pass since 3.0.0).
//
// It also holds the template rules the rest of the repository's gates cannot
// see: the dash rule bans a double hyphen used as punctuation, every evidence
// block carries a rendered result, and the What's next tile names a role and
// an effort rather than a model.
//
// K13 3.0.0 (2026-10-15) replaced the six response levels with one pass, the
// quick squeeze. This test used to slice six panes out of each template and
// pin the juice box default; it now reads the one pass, and the tests that
// pinned six levels and the juice box default are replaced by the test that
// no level survives in either template.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const k13 = readFileSync(resolve(repoRoot, "K13.md"), "utf8");
const mdTemplate = readFileSync(
  resolve(repoRoot, "templates/temp1ate.md"),
  "utf8",
);
const htmlTemplate = readFileSync(
  resolve(repoRoot, "templates/temp1ate.html"),
  "utf8",
);

/**
 * The twelve tiles, in the order K13.md "The report template" defines them.
 * `key` is the phrase that must appear in the K13 list item, `tile` is the
 * data-tile id in the HTML template, `md` is the heading in the markdown one.
 */
const TILES = [
  { key: "header strip", tile: "header-strip", md: "### Report" },
  { key: "finding", tile: "finding", md: "### Finding" },
  { key: "verdict row", tile: "verdict-row", md: "### Verdict" },
  { key: "how it fits", tile: "how-it-fits", md: "### How it fits" },
  { key: "environment card", tile: "environment-card", md: "### Environment" },
  { key: "checks table", tile: "checks-table", md: "### Checks" },
  { key: "evidence blocks", tile: "evidence-blocks", md: "### Evidence" },
  { key: "discrepancies", tile: "discrepancies", md: "### Discrepancies" },
  { key: "what's next", tile: "whats-next", md: "### What's next" },
  { key: "owner actions", tile: "owner-actions", md: "### Owner actions" },
  { key: "what was not done", tile: "what-was-not-done", md: "### What was not done" },
  { key: "aieds disclosure", tile: "aieds-disclosure", md: "### AiEDs disclosure" },
];

const MD_PASS = "## quick squeeze";
const HTML_PASS = '<div id="quick-squeeze"';

function reportTemplateList() {
  const start = k13.indexOf("## The report template");
  assert.ok(start >= 0, 'K13.md no longer has a "The report template" section');
  const rest = k13.slice(start + 1);
  const end = rest.indexOf("\n## ");
  const body = end >= 0 ? rest.slice(0, end) : rest;
  return body
    .split("\n")
    .filter((l) => /^\d+\. /.test(l))
    .map((l) => l.replace(/^\d+\. /, "").toLowerCase());
}

/** The one pass of the markdown template, from its heading to the end. */
function mdPane() {
  const from = mdTemplate.indexOf(MD_PASS);
  assert.ok(from >= 0, `temp1ate.md has no "${MD_PASS}" pass`);
  return mdTemplate.slice(from);
}

/** The one pass of the HTML template, from its wrapper to the end. */
function htmlPane() {
  const from = htmlTemplate.indexOf(HTML_PASS);
  assert.ok(from >= 0, "temp1ate.html has no quick-squeeze pass");
  return htmlTemplate.slice(from);
}

test("K13.md still defines the twelve-tile list this gate reads", () => {
  const items = reportTemplateList();
  assert.equal(
    items.length,
    TILES.length,
    `K13.md "The report template" lists ${items.length} tiles; this gate knows ` +
      `${TILES.length}. Update the gate deliberately, not silently.`,
  );
  items.forEach((item, i) => {
    assert.ok(
      item.includes(TILES[i].key),
      `K13.md tile ${i + 1} reads "${item}", which does not name ` +
        `"${TILES[i].key}"; the list was reordered or reworded`,
    );
  });
});

test("the md template's section order matches the K13.md list", () => {
  const pane = mdPane();
  let previous = -1;
  let previousTile = "(start of pass)";
  for (const t of TILES) {
    const at = pane.indexOf(t.md);
    assert.ok(at >= 0, `temp1ate.md is missing the "${t.md}" tile. Every report carries every tile.`);
    assert.ok(
      at > previous,
      `"${t.md}" appears before "${previousTile}", but K13.md lists it after`,
    );
    previous = at;
    previousTile = t.md;
  }
});

test("the html pass carries the same tile ids in the same order", () => {
  const found = [...htmlPane().matchAll(/data-tile="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    found,
    TILES.map((t) => t.tile),
    "the html tile set or order differs from K13.md. The same tiles, the same order, the same count.",
  );
});

test("every evidence block carries a rendered result", () => {
  const pane = htmlPane();
  const blocks = [...pane.matchAll(/<div class="evidence">([\s\S]*?)<\/div>\s*(?=<div class="evidence">|<\/div>)/g)];
  assert.ok(blocks.length > 0, "the pass has no evidence block at all");
  blocks.forEach((b, i) => {
    assert.match(b[1], /class="ev-code"/, `evidence block ${i + 1} has no command`);
    assert.match(
      b[1],
      /class="ev-result"/,
      `evidence block ${i + 1} has a command with no result. A query with no result fails the K13 gate.`,
    );
  });
  // Inside the evidence tile the counts must match exactly: one result per
  // command, never a command on its own and never a result on its own.
  // Commands elsewhere (an owner action, the What's next dispatch) are
  // instructions to run, not evidence of a run, so they are not expected to
  // carry a result.
  const from = pane.indexOf('data-tile="evidence-blocks"');
  const to = pane.indexOf('data-tile="discrepancies"');
  const tile = pane.slice(from, to);
  const codes = (tile.match(/class="ev-code"/g) || []).length;
  const results = (tile.match(/class="ev-result"/g) || []).length;
  assert.equal(codes, results, `evidence tile has ${codes} commands and ${results} results`);
});

test("the What's next tile asks for a role and an effort, never a model", () => {
  const pane = htmlPane();
  const from = pane.indexOf('data-tile="whats-next"');
  const to = pane.indexOf('data-tile="owner-actions"');
  assert.ok(from >= 0 && to > from, "the pass has no What's next tile");
  const tile = pane.slice(from, to);
  for (const slot of ["role", "effort"]) {
    assert.ok(tile.includes(`>${slot}<`), `What's next has no ${slot} slot`);
  }
  assert.match(tile, /No next step, this work is complete/, "What's next must offer the completion answer");
  assert.doesNotMatch(
    tile,
    /claude|gpt-|gemini|sonnet|opus|haiku|llama|mistral/i,
    "What's next names a model. K13 is vendor-neutral: it asks for a role and an effort, and a model name needs a cited mapping.",
  );
  // The markdown template wraps its prose, so compare with whitespace collapsed.
  const flatMd = mdTemplate.replace(/\s+/g, " ");
  assert.equal((flatMd.match(/No next step, this work is complete/g) || []).length, 1);
  // Counted by splitting on the literal, not by building a regexp out of it.
  for (const slot of ["| role |", "| effort |"]) {
    assert.equal(
      mdTemplate.split(slot).length - 1,
      1,
      `temp1ate.md is missing the ${slot.replaceAll("|", "").trim()} slot`,
    );
  }
});

test("both templates are one pass and keep no response level", () => {
  // K13 3.0.0 removed the ladder. A template that still carries a level name,
  // a level picker or a stored level would teach the old shape.
  for (const [file, text] of [
    ["temp1ate.md", mdTemplate],
    ["temp1ate.html", htmlTemplate],
  ]) {
    assert.doesNotMatch(
      text,
      /soda pop|energy drink|black coffee|loose leaf|yerba mate|juice box|response level|reserved level|optional level|showLevel|data-level|localStorage/i,
      `${file} still carries a response level`,
    );
    assert.equal(
      text.split(file.endsWith("md") ? MD_PASS : 'id="quick-squeeze"').length - 1,
      1,
      `${file} must carry exactly one quick squeeze pass`,
    );
    assert.match(text, /v3\.0\.0/, `${file} does not name K13 3.0.0`);
  }
});

test("the confidence is a field of the Verdict tile in both templates", () => {
  assert.match(htmlTemplate, /<span class="vr-key">confidence<\/span>/);
  assert.match(mdTemplate, /\*\*confidence:\*\*/);
});

test("the html template reserves tile space rather than letting content set it", () => {
  // Structural invariance has a visible consequence: switching level must not
  // reflow the page. That holds only if the tile heights come from the grid.
  // Verified by measurement at 1440, 834 and 390 (see the PR body); this test
  // holds the CSS that makes it true, so it cannot be removed by accident.
  assert.match(htmlTemplate, /grid-auto-rows:\s*\d+px/, "tile rows must be a fixed size");
  assert.match(htmlTemplate, /\.tile-body\s*\{[\s\S]*?overflow:\s*auto/, "a tile must scroll inside itself");
  for (const t of TILES) {
    assert.ok(
      htmlTemplate.includes(`.t-${t.tile}`),
      `no grid placement rule for the ${t.tile} tile`,
    );
  }
});

test("no double hyphen is used as a dash in either template", () => {
  // K13 2.0.0 step 13 bans "--" as a surrogate for the character the em dash
  // rule already bans. It does not ban every pair of hyphens: an HTML comment
  // delimiter, a CSS custom property, a markdown rule or table separator, a
  // SQL line comment and a command-line flag are not dashes. Each exemption is
  // matched by shape, so a real surrogate cannot hide inside one.
  const EXEMPT = [
    /<!--/g, // HTML comment open
    /--!?>/g, // HTML comment close, both the "-->" and "--!>" spellings
    /--[a-z][a-z0-9-]*/g, // CSS custom property, command-line flag
    /^-{3,}$/gm, // markdown horizontal rule
    /^\|[\s|:-]+\|$/gm, // markdown table separator row (any column count)
    /^-- /gm, // SQL line comment
  ];
  for (const [file, original] of [
    ["templates/temp1ate.md", mdTemplate],
    ["templates/temp1ate.html", htmlTemplate],
  ]) {
    let text = original;
    for (const re of EXEMPT) text = text.replace(re, " ");
    const offenders = [];
    text.split("\n").forEach((line, i) => {
      if (line.includes("--")) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
    assert.deepEqual(
      offenders,
      [],
      `a double hyphen is being used as a dash. Use a comma, a colon, or a ` +
        `new sentence:\n  ${offenders.join("\n  ")}`,
    );
  }
});

// Gate: the reference report templates in templates/ still render what K13.md
// requires.
//
// WHY THIS EXISTS. K13 2.0.0 added "The report template" to the standard: an
// ordered list of the sections a conforming report carries. templates/ is one
// rendering of that list, shipped as a reference implementation. Nothing
// compared the two, so the list could be reordered in the specification, or a
// section dropped from the template, and both files would still look fine on
// their own. This test reads the ordered list out of K13.md, not out of a copy
// of it, and checks the markdown template against it.
//
// It also holds the two template rules that the rest of the repository's gates
// cannot see: the dash rule now bans a double hyphen used as punctuation, and
// K13 step 11 names energy drink as the level a picker opens on.
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

/** The ordered list K13.md "The report template" defines, by keyword. */
const EXPECTED_SECTIONS = [
  "finding",
  "verdict row",
  "environment card",
  "checks table",
  "discrepancies",
  "owner actions",
  "what was not done",
];

/**
 * How each K13 section shows up in the markdown template.
 *
 * `pane` sections belong to the answer, so K13 requires them in this order
 * inside every normative level and this test checks that order. The
 * environment card is about the run, not about the level, so K13 lets it sit
 * once in the report header; it is checked for presence, not position.
 * Discrepancies and the not-done note have no content until the work is done,
 * so a blank template cannot pre-print them and K13 says so.
 */
const MARKERS = new Map([
  ["finding", { where: "pane", marker: "**Finding:**" }],
  ["verdict row", { where: "pane", marker: "**Gate result:**" }],
  ["environment card", { where: "header", marker: "**Model:**" }],
  ["checks table", { where: "pane", marker: "| Check | Result | Notes |" }],
  ["discrepancies", { where: "fill-time" }],
  ["owner actions", { where: "pane", marker: "1. FILL:" }],
  ["what was not done", { where: "fill-time" }],
]);

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

test("K13.md still defines the report section list this gate reads", () => {
  const items = reportTemplateList();
  assert.equal(
    items.length,
    EXPECTED_SECTIONS.length,
    `K13.md "The report template" lists ${items.length} sections; this gate ` +
      `knows ${EXPECTED_SECTIONS.length}. Update the gate deliberately.`,
  );
  items.forEach((item, i) => {
    assert.ok(
      item.includes(EXPECTED_SECTIONS[i]),
      `K13.md report section ${i + 1} reads "${item}", which does not name ` +
        `"${EXPECTED_SECTIONS[i]}"; the list was reordered or reworded`,
    );
  });
});

test("the md template's section order matches the K13.md list", () => {
  const items = reportTemplateList();
  const levels = [
    "## juice box",
    "## soda pop",
    "## energy drink",
    "## black coffee",
    "## loose leaf",
    "## yerba mate",
  ];

  // The environment card is report-level: present, and ahead of the levels.
  const headerMarker = MARKERS.get("environment card").marker;
  const headerAt = mdTemplate.indexOf(headerMarker);
  assert.ok(headerAt >= 0, `the template has no environment card (${headerMarker})`);
  assert.ok(
    headerAt < mdTemplate.indexOf(levels[0]),
    "the environment card must sit in the report header, ahead of the levels",
  );

  // Pane sections, in the order K13 lists them, inside every level that
  // carries them. A level that omits an optional section is fine; a level that
  // carries two of them out of K13 order is not.
  const paneOrder = items
    .map((item) => EXPECTED_SECTIONS.find((k) => item.includes(k)))
    .filter((key) => MARKERS.get(key).where === "pane")
    .map((key) => ({ key, marker: MARKERS.get(key).marker }));

  for (let i = 0; i < levels.length; i += 1) {
    const from = mdTemplate.indexOf(levels[i]);
    assert.ok(from >= 0, `the template has no ${levels[i]} level`);
    const to =
      i + 1 < levels.length
        ? mdTemplate.indexOf(levels[i + 1])
        : mdTemplate.indexOf("## AiEDs disclosure");
    const pane = mdTemplate.slice(from, to);

    let previous = -1;
    let previousKey = "(start of level)";
    for (const { key, marker } of paneOrder) {
      const at = pane.indexOf(marker);
      if (at < 0) continue;
      assert.ok(
        at > previous,
        `${levels[i]}: "${key}" appears before "${previousKey}", but K13.md ` +
          `lists it after`,
      );
      previous = at;
      previousKey = key;
    }
    // Two sections are not optional at any level.
    for (const key of ["finding", "verdict row"]) {
      assert.ok(
        pane.includes(MARKERS.get(key).marker),
        `${levels[i]} has no "${key}"`,
      );
    }
  }
});

test("both templates carry all six normative levels", () => {
  const names = [
    "juice box",
    "soda pop",
    "energy drink",
    "black coffee",
    "loose leaf",
    "yerba mate",
  ];
  for (const name of names) {
    assert.ok(mdTemplate.includes(name), `temp1ate.md is missing ${name}`);
    assert.ok(htmlTemplate.includes(name), `temp1ate.html is missing ${name}`);
  }
  // K13 2.0.0 promoted the last two from RESERVED. No template may still say
  // they are optional.
  for (const [file, text] of [
    ["temp1ate.md", mdTemplate],
    ["temp1ate.html", htmlTemplate],
  ]) {
    assert.doesNotMatch(
      text,
      /reserved level|optional level|expert extension/i,
      `${file} still calls a normative level reserved or optional`,
    );
  }
});

test("the html template opens on energy drink, the K13 step 11 default", () => {
  assert.match(
    htmlTemplate,
    /class="tab-btn active" data-level="energy_drink"/,
    "the active tab must be energy drink",
  );
  assert.match(
    htmlTemplate,
    /<section id="pane-energy_drink" class="level-pane" role="tabpanel">/,
    "the energy drink pane must be the one that is not hidden",
  );
  assert.match(
    htmlTemplate,
    /<section id="pane-juice_box" class="level-pane" role="tabpanel" hidden>/,
    "the juice box pane must start hidden",
  );
  assert.match(
    htmlTemplate,
    /saved : 'energy_drink'/,
    "the stored-level fallback must be energy drink",
  );
});

test("no double hyphen is used as a dash in either template", () => {
  // K13 2.0.0 step 13 bans "--" as a surrogate for the character the em dash
  // rule already bans. It does not ban every pair of hyphens: an HTML comment
  // delimiter, a CSS custom property, a markdown rule or table separator, a
  // SQL line comment and a command-line flag are not dashes. Each exemption is
  // matched by shape, so a real surrogate cannot hide inside one.
  const EXEMPT = [
    /<!--/g, // HTML comment open
    /-->/g, // HTML comment close
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
    const lines = text.split("\n");
    const offenders = [];
    lines.forEach((line, i) => {
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

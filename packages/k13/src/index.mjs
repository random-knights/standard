// K13 checks: the parts of the K13 machine gate that this repository already
// checks in code, packaged so a report can be checked outside it.
//
// Every rule here is written in K13.md ("The machine gate", "The report
// template", "Structural invariance", "Evidence blocks", "What's next"), and
// every implementation is a port of a gate that already runs: the structure,
// evidence and What's next checks from spec/test/templates.test.mjs in
// random-knights/standard (which holds the K13 reference templates), and the
// dash check from the Random Knights workspace docs gate. Nothing here is a
// new rule. The rules K13 names
// that no code checks yet are listed in NOT_IMPLEMENTED and the README, so a
// clean result is never read as a full pass of the gate.
//
// The tile list and the level names are read out of K13.md at run time, not
// out of a copy of it, so the checks move when the standard moves.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Built from code points so this file stays ASCII.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

/** Where K13.md is: in the package, or at the repository root when run from source. */
function k13Path() {
  // In a source checkout the repository root K13.md is the one source, and a
  // staged copy next to the package may be stale, so the root wins there. An
  // installed package has no scripts/ directory three levels up, and uses its
  // own bundled copy.
  const fromSource = existsSync(join(here, "..", "..", "..", "scripts", "stage-npm-package.mjs"));
  const order = fromSource
    ? [join(here, "..", "..", "..", "K13.md"), join(here, "..", "K13.md")]
    : [join(here, "..", "K13.md"), join(here, "..", "..", "..", "K13.md")];
  for (const p of order) {
    if (existsSync(p)) return p;
  }
  throw new Error("K13.md not found next to this package");
}

/** The K13 text this package checks against. */
export const K13_TEXT = readFileSync(k13Path(), "utf8");

/** The K13 version, from the "**Version:**" line of K13.md. */
export const K13_VERSION = (K13_TEXT.match(/^\*\*Version:\*\*\s*(\S+)/m) || [])[1] ?? null;

function section(heading) {
  const start = K13_TEXT.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`K13.md has no "${heading}" section`);
  const rest = K13_TEXT.slice(start + 1);
  const end = rest.indexOf("\n## ");
  return end >= 0 ? rest.slice(0, end) : rest;
}

/**
 * The six normative levels, in ladder order, from the table in K13.md "The
 * response levels". `id` is the name with spaces as underscores, which is
 * how the reference HTML template names its panes.
 */
export const LEVELS = section("The response levels")
  .split("\n")
  .filter((l) => /^\| [a-z][a-z ]+ \| /.test(l))
  .map((l) => l.split("|")[1].trim())
  .filter((name) => name !== "level")
  .map((name) => ({ name, id: name.replace(/ /g, "_") }));

/**
 * The twelve tiles in the order K13.md "The report template" lists them.
 * `key` must appear in the K13 list item; `tile` is the data-tile id in the
 * reference HTML template; `md` is the heading in the reference markdown one.
 * The markup names belong to the reference templates, which is why they are
 * spelled out here; the ORDER and the COUNT come from K13.md and are checked
 * against it below.
 */
const TILE_MARKUP = [
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

function reportTemplateList() {
  return section("The report template")
    .split("\n")
    .filter((l) => /^\d+\. /.test(l))
    .map((l) => l.replace(/^\d+\. /, "").toLowerCase());
}

/** The tile list, verified against K13.md; throws if the two have drifted. */
export const TILES = (() => {
  const items = reportTemplateList();
  if (items.length !== TILE_MARKUP.length) {
    throw new Error(
      `K13.md lists ${items.length} report tiles; this package knows ` +
        `${TILE_MARKUP.length}. The package needs updating for this K13 version.`,
    );
  }
  items.forEach((item, i) => {
    if (!item.includes(TILE_MARKUP[i].key)) {
      throw new Error(`K13.md tile ${i + 1} reads "${item}", not "${TILE_MARKUP[i].key}"`);
    }
  });
  return TILE_MARKUP;
})();

/** Rules K13 writes down that this package does NOT check. */
export const NOT_IMPLEMENTED = [
  "machine gates 1, 2 and 3 on a whole file: they run on the passes of a report given to checkNumberAgreement, checkGradedValues and checkTraceable, because the passes of a free-text report cannot be located reliably",
  "machine gate 6 for markdown reports: evidence block has a rendered result",
  "the seventh check for markdown reports: no model name in What's next",
  "response level of each pass (that it is written at its level)",
  "the thirteen steps as process (cost logged, state verified, owner action named)",
  "humor rules",
];

// ---------------------------------------------------------------------------
// Level identifiers and the levels registry (K13.md "Level identifiers").
// ---------------------------------------------------------------------------

/** Level name -> { id, legacy }, read from the identifier table in K13.md. */
export const IDENTIFIERS = new Map(
  section("Level identifiers")
    .split("\n")
    .filter((l) => /^\| [a-z][a-z ]+ \| [a-z_]+ \| /.test(l))
    .map((l) => {
      const [, name, id, legacy] = l.split("|").map((c) => c.trim());
      return [name, { id, legacy: legacy === "same" ? null : legacy }];
    })
    .filter(([name]) => name !== "level"),
);

/**
 * The levels registry: the ladder table and the identifier table of K13.md as
 * data. This is the content of k13-levels.json on the site. It is generated,
 * never edited, so the ladder has one source.
 */
export function levelsRegistry() {
  const rows = section("The response levels")
    .split("\n")
    .map((l) => /^\| ([a-z][a-z ]+) \| ([^|]+) \| (\d+(?:\.\d+)?) \| U\+([0-9A-F]{4,6}) ([^|]+) \|$/.exec(l))
    .filter(Boolean);
  const dm = section("The default level").match(/^(\w+(?: \w+)?) is the default response level/im);
  const defaultName = dm ? dm[1].toLowerCase() : "";
  return {
    k13Version: K13_VERSION,
    source: "K13.md",
    default: IDENTIFIERS.get(defaultName)?.id ?? null,
    levels: rows.map(([, name, grades, step, hex, glyphName]) => ({
      id: IDENTIFIERS.get(name)?.id ?? null,
      name,
      grades: grades.trim(),
      step,
      glyph: { codepoint: `U+${hex}`, name: glyphName.trim() },
      legacyId: IDENTIFIERS.get(name)?.legacy ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Machine gate checks 1, 2 and 3 on the passes of a report.
//
// A "passes" argument is an object keyed by level name (or identifier) whose
// values are the written text of that level. Checks 1 and 2 compare the passes
// with each other; check 3 compares them with the run figures.
// ---------------------------------------------------------------------------

const NUMBER_WORDS = new Map(
  ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"].map(
    (w, i) => [w, String(i + 2)],
  ),
);
NUMBER_WORDS.set("zero", "0");

/**
 * Every figure in a text, as a set of strings: digit figures such as "2.0.0"
 * or "12", and spelled numbers from zero to twelve, mapped to digits so "six"
 * and "6" are the same figure. "one" is not read as a figure, because it is
 * also a pronoun ("one of the copies"); a one-to-two disagreement is therefore
 * out of this check's reach and is listed in the README.
 */
export function extractFigures(text) {
  const out = new Set();
  for (const m of text.matchAll(/\b\d+(?:\.\d+)*\b|\b[A-Za-z]+\b/g)) {
    const t = m[0];
    if (/^\d/.test(t)) out.add(t);
    else if (NUMBER_WORDS.has(t.toLowerCase())) out.add(NUMBER_WORDS.get(t.toLowerCase()));
  }
  return out;
}

function levelKey(k) {
  const n = String(k).replace(/_/g, " ");
  return LEVELS.find((l) => l.name === n) ? n : null;
}

function normalizePasses(passes) {
  const out = new Map();
  for (const [k, v] of Object.entries(passes ?? {})) {
    const name = levelKey(k);
    if (name) out.set(name, typeof v === "string" ? v : v.text);
  }
  return out;
}

function missingLevels(map) {
  return LEVELS.filter((l) => !map.has(l.name)).map((l) =>
    finding("structure", `missing level "${l.name}"`),
  );
}

/** Machine gate 1: a figure at one level must be at every level, unchanged. */
export function checkNumberAgreement(passes) {
  const map = normalizePasses(passes);
  const missing = missingLevels(map);
  if (missing.length) return missing;
  const sets = new Map(LEVELS.map((l) => [l.name, extractFigures(map.get(l.name))]));
  const all = new Set([...sets.values()].flatMap((s) => [...s]));
  const out = [];
  for (const fig of [...all].sort()) {
    const absent = LEVELS.filter((l) => !sets.get(l.name).has(fig)).map((l) => l.name);
    if (absent.length) {
      out.push(
        finding(
          "number-agreement",
          `figure "${fig}" is at ${LEVELS.length - absent.length} level(s) and missing at: ${absent.join(", ")}`,
        ),
      );
    }
  }
  return out;
}

/** The graded values K13 machine gate check 2 names. */
export const GRADED_VALUES = ["verdict", "confidence", "provenance"];

/**
 * Machine gate 2. `graded` is keyed by level name; each value is
 * { verdict, confidence, provenance }, each of those { value, quote }. The
 * quote must appear in that level's text, and the value must be the same at
 * every level. The author declares the graded values; the check holds the
 * author to them.
 */
export function checkGradedValues(passes, graded) {
  const map = normalizePasses(passes);
  const out = missingLevels(map);
  if (out.length) return out;
  const g = new Map(Object.entries(graded ?? {}).map(([k, v]) => [levelKey(k), v]));
  const flat = (s) => s.replace(/\s+/g, " ").toLowerCase();
  for (const key of GRADED_VALUES) {
    const seen = new Map();
    for (const l of LEVELS) {
      const cell = g.get(l.name)?.[key];
      if (!cell || !cell.value || !cell.quote) {
        out.push(finding("graded-values", `${l.name}: no ${key}`));
        continue;
      }
      if (!flat(map.get(l.name)).includes(flat(cell.quote))) {
        out.push(finding("graded-values", `${l.name}: the ${key} quote is not in the pass`));
      }
      seen.set(l.name, cell.value);
    }
    if (new Set(seen.values()).size > 1) {
      out.push(
        finding(
          "graded-values",
          `${key} differs between levels: ${[...seen].map(([n, v]) => `${n}=${v}`).join(", ")}`,
        ),
      );
    }
  }
  return out;
}

/** Machine gate 3: every figure in the passes is one of the run's figures. */
export function checkTraceable(passes, runFigures) {
  const map = normalizePasses(passes);
  const known = new Set((runFigures ?? []).map(String));
  const out = [];
  for (const l of LEVELS) {
    if (!map.has(l.name)) continue;
    for (const fig of extractFigures(map.get(l.name))) {
      if (!known.has(fig)) {
        out.push(finding("traceable", `${l.name}: figure "${fig}" is not in the run data`));
      }
    }
  }
  return out;
}

/** Machine gate 4 over every pass of a report. */
export function checkPassDashes(passes) {
  const map = normalizePasses(passes);
  const out = [];
  for (const [name, text] of map) {
    for (const f of checkDashes(text)) out.push({ ...f, message: `${name}: ${f.message}` });
  }
  return out;
}

/**
 * The six passes of "One fact, six ways" in K13.md, read at run time, with
 * whitespace collapsed. The worked example is held to its own gate.
 */
export function exampleSixWays() {
  const body = section("One fact, six ways");
  const out = {};
  for (const m of body.matchAll(/^\*\*([a-z ]+)\.\*\* ([^\n]+(?:\n[^\n]+)*)/gm)) {
    out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Glyph text alternatives (K13.md "The response levels").
// ---------------------------------------------------------------------------

const GLYPHS = new Set([0x1f9c3, 0x1f964, 0x1f9cb, 0x2615, 0x1fad6, 0x1f9c9]);

/**
 * Every rendered level glyph in an HTML document must be hidden from
 * assistive technology with the level name written beside it, or be an image
 * role with an accessible name. Returns one finding per offending glyph.
 */
export function checkGlyphAlternatives(html) {
  const out = [];
  const re = /&#x([0-9a-fA-F]{4,6});|&#(\d{4,7});|(\p{Extended_Pictographic})/gu;
  for (const m of html.matchAll(re)) {
    const cp = m[1] ? parseInt(m[1], 16) : m[2] ? parseInt(m[2], 10) : m[3].codePointAt(0);
    if (!GLYPHS.has(cp)) continue;
    const before = html.slice(0, m.index);
    const open = before.lastIndexOf("<");
    const tag = open >= 0 && before.indexOf(">", open) === before.length - 1 ? html.slice(open, m.index) : "";
    const hidden = /aria-hidden="true"/.test(tag);
    const labelled = /role="img"/.test(tag) && /aria-label="[^"]+"/.test(tag);
    // A hidden glyph needs the level name written visibly right beside it.
    const near = html.slice(m.index, m.index + 300).toLowerCase();
    const named = LEVELS.some((l) => near.includes(l.name));
    if (labelled || (hidden && named)) continue;
    out.push(
      finding(
        "glyph-alt",
        `U+${cp.toString(16).toUpperCase()} has no text alternative: hide it with aria-hidden="true" beside the visible level name, or give it role="img" and an aria-label`,
        before.split("\n").length,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Test vectors (packages/k13/vectors).
// ---------------------------------------------------------------------------

function vectorsDir() {
  const p = join(here, "..", "vectors");
  if (!existsSync(p)) throw new Error("vectors/ not found next to this package");
  return p;
}

/** The vector list: a passing and a failing vector per machine gate check. */
export function loadVectors() {
  const dir = vectorsDir();
  const list = JSON.parse(readFileSync(join(dir, "vectors.json"), "utf8"));
  return list.map((v) => ({
    ...v,
    passes: v.passesFrom === "K13.md#one-fact-six-ways" ? exampleSixWays() : v.passes,
    reportText: v.report ? readFileSync(join(dir, v.report.file), "utf8") : undefined,
  }));
}

/**
 * Run the gate check a vector is for and return its findings. A passing
 * vector must return none; a failing one must return a finding whose message
 * contains the vector's `expectMessage`.
 */
export function runVector(v) {
  switch (v.gate) {
    case 1:
      return checkNumberAgreement(v.passes);
    case 2:
      return checkGradedValues(v.passes, v.graded);
    case 3:
      return checkTraceable(v.passes, v.runFigures);
    case 4:
      return checkPassDashes(v.passes);
    case 5:
      return (v.report.format === "html"
        ? checkHtmlStructure(v.reportText)
        : checkMarkdownStructure(v.reportText)
      ).filter((f) => f.check === "structure");
    case 6:
      return checkHtmlStructure(v.reportText).filter((f) => f.check === "evidence");
    default:
      throw new Error(`vector ${v.id}: no gate ${v.gate}`);
  }
}

function finding(check, message, line) {
  return line === undefined ? { check, message } : { check, message, line };
}

/**
 * Machine gate 4: no em dash, no en dash, no double-hyphen surrogate.
 *
 * Em and en dashes fail anywhere, code included. The double hyphen fails when
 * it is USED AS A DASH, which K13 step 13 distinguishes from a command-line
 * flag or a markdown table rule: "--" with whitespace or a line edge on both
 * sides, outside fenced code blocks and outside inline backtick spans. This is
 * the "dd" rule of the Random Knights workspace docs gate
 * (check-root-docs.ps1), ported line for line: `--json`, `| --- |`, a lane id
 * such as `root--pm-0908` and a quoted mention of "--" do not match.
 */
export function checkDashes(text) {
  const out = [];
  let inFence = false;
  text.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (line.includes(EM_DASH)) out.push(finding("dash", "em dash", i + 1));
    if (line.includes(EN_DASH)) out.push(finding("dash", "en dash", i + 1));
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const prose = line.replace(/`[^`]*`/g, "");
    if (/(^|\s)--(\s|$)/.test(prose)) {
      out.push(finding("dash", "double hyphen used as a dash", i + 1));
    }
  });
  return out;
}

/** Is this a report in the reference markdown template's shape? */
function mdLevelStarts(text) {
  // A level heading starts its line, so a mention of "## energy drink" inside
  // prose or inline code is not mistaken for one.
  return LEVELS.map((l) => {
    const m = new RegExp(`^## ${l.name}(?![a-z])`, "m").exec(text);
    return m ? m.index : -1;
  });
}

function mdPane(text, i) {
  const starts = mdLevelStarts(text);
  const from = starts[i];
  const to = i + 1 < LEVELS.length ? starts[i + 1] : text.length;
  return text.slice(from, to < 0 ? text.length : to);
}

function htmlPane(text, id) {
  const from = text.indexOf(`<div id="pane-${id}"`);
  if (from < 0) return null;
  const rest = text.slice(from + 1);
  const end = rest.indexOf('<div id="pane-');
  return end >= 0 ? rest.slice(0, end) : rest;
}

/**
 * Machine gate 5 and "Structural invariance" for a markdown report in the
 * reference template shape: every normative level present, and every level
 * carries every tile in K13 order.
 */
export function checkMarkdownStructure(text) {
  const out = [];
  const starts = mdLevelStarts(text);
  LEVELS.forEach((level, i) => {
    if (starts[i] < 0) out.push(finding("structure", `missing level "${level.name}"`));
  });
  if (out.length) return out;
  LEVELS.forEach((level, i) => {
    const pane = mdPane(text, i);
    let previous = -1;
    let previousTile = "(start of level)";
    for (const t of TILES) {
      const at = pane.indexOf(t.md);
      if (at < 0) {
        out.push(finding("structure", `${level.name}: missing tile "${t.md}"`));
        continue;
      }
      if (at < previous) {
        out.push(
          finding("structure", `${level.name}: "${t.md}" comes before "${previousTile}"`),
        );
      }
      previous = at;
      previousTile = t.md;
    }
  });
  // What's next: the completion answer and the role and effort slots, once
  // per level.
  const flat = text.replace(/\s+/g, " ");
  const completions = (flat.match(/No next step, this work is complete/g) || []).length;
  if (completions !== LEVELS.length) {
    out.push(
      finding(
        "whats-next",
        `the completion answer appears ${completions} times; expected once per level (${LEVELS.length})`,
      ),
    );
  }
  for (const slot of ["| role |", "| effort |"]) {
    const n = text.split(slot).length - 1;
    if (n !== LEVELS.length) {
      out.push(
        finding(
          "whats-next",
          `the ${slot.replaceAll("|", "").trim()} slot appears ${n} times; expected once per level`,
        ),
      );
    }
  }
  return out;
}

/**
 * Machine gate 5, machine gate 6 and the seventh check for an HTML report in
 * the reference template shape (level panes with data-tile ids).
 */
export function checkHtmlStructure(text) {
  const out = [];
  const expected = TILES.map((t) => t.tile);
  for (const level of LEVELS) {
    const pane = htmlPane(text, level.id);
    if (pane === null) {
      out.push(finding("structure", `missing level pane "pane-${level.id}"`));
      continue;
    }
    const found = [...pane.matchAll(/data-tile="([a-z-]+)"/g)].map((m) => m[1]);
    if (found.join(",") !== expected.join(",")) {
      out.push(
        finding(
          "structure",
          `pane-${level.id}: tiles [${found.join(", ")}] differ from K13 order [${expected.join(", ")}]`,
        ),
      );
    }

    // Machine gate 6: every evidence block in the evidence tile carries its
    // command and its result, and the two counts match. Blocks are cut with
    // string operations, not a regular expression, so a hostile file cannot
    // make the check run in polynomial time.
    const from = pane.indexOf('data-tile="evidence-blocks"');
    const to = pane.indexOf('data-tile="discrepancies"');
    const tile = from >= 0 && to > from ? pane.slice(from, to) : "";
    const blocks = tile.split('<div class="evidence">').slice(1);
    if (blocks.length === 0) {
      out.push(finding("evidence", `pane-${level.id}: no evidence block`));
    }
    blocks.forEach((b, i) => {
      if (!b.includes('class="ev-code"')) {
        out.push(finding("evidence", `pane-${level.id}: evidence block ${i + 1} has no command`));
      }
      if (!b.includes('class="ev-result"')) {
        out.push(
          finding("evidence", `pane-${level.id}: evidence block ${i + 1} has a command with no result`),
        );
      }
    });
    const codes = tile.split('class="ev-code"').length - 1;
    const results = tile.split('class="ev-result"').length - 1;
    if (codes !== results) {
      out.push(
        finding(
          "evidence",
          `pane-${level.id}: ${codes} commands and ${results} results in the evidence tile`,
        ),
      );
    }

    // The seventh check: What's next asks for a role and an effort, always
    // offers the completion answer, and names no model.
    const wFrom = pane.indexOf('data-tile="whats-next"');
    const wTo = pane.indexOf('data-tile="owner-actions"');
    if (wFrom < 0 || wTo <= wFrom) {
      out.push(finding("whats-next", `pane-${level.id}: no What's next tile`));
      continue;
    }
    const w = pane.slice(wFrom, wTo);
    for (const slot of ["role", "effort"]) {
      if (!w.includes(`>${slot}<`)) {
        out.push(finding("whats-next", `pane-${level.id}: What's next has no ${slot} slot`));
      }
    }
    if (!/No next step, this work is complete/.test(w)) {
      out.push(
        finding("whats-next", `pane-${level.id}: What's next does not offer the completion answer`),
      );
    }
    if (/claude|gpt-|gemini|sonnet|opus|haiku|llama|mistral/i.test(w)) {
      out.push(finding("whats-next", `pane-${level.id}: What's next names a model`));
    }
  }
  return out;
}

/**
 * Check one document. `format` is "md", "html" or "text". The dash check runs
 * on every document. The structure checks run only when the document is a
 * report in the reference template shape; otherwise they are listed as skipped.
 */
export function checkText(text, format = "text") {
  const findings = checkDashes(text);
  const ran = ["dash"];
  const skipped = [];
  if (format === "md" && mdLevelStarts(text).some((s) => s >= 0)) {
    findings.push(...checkMarkdownStructure(text));
    ran.push("structure", "whats-next");
  } else if (format === "html" && text.includes('<div id="pane-')) {
    findings.push(...checkHtmlStructure(text));
    findings.push(...checkGlyphAlternatives(text));
    ran.push("structure", "evidence", "whats-next", "glyph-alt");
  } else {
    skipped.push("structure (not a report in the reference template shape)");
  }
  return { ok: findings.length === 0, findings, ran, skipped };
}

/** Check one file; the format comes from the extension. */
export function checkFile(path) {
  const text = readFileSync(path, "utf8");
  const format = /\.html?$/i.test(path) ? "html" : /\.(md|markdown)$/i.test(path) ? "md" : "text";
  return { file: path, ...checkText(text, format) };
}

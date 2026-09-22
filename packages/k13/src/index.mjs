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
  for (const p of [join(here, "..", "K13.md"), join(here, "..", "..", "..", "K13.md")]) {
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
 * learning level ladder". `id` is the name with spaces as underscores, which is
 * how the reference HTML template names its panes.
 */
export const LEVELS = section("The learning level ladder")
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
  "machine gate 1: number agreement across levels",
  "machine gate 2: every graded value (verdict, confidence, provenance) at every level",
  "machine gate 3: no untraceable figure (needs the run data)",
  "machine gate 6 for markdown reports: evidence block has a rendered result",
  "the seventh check for markdown reports: no model name in What's next",
  "reading level of each pass",
  "the thirteen steps as process (cost logged, state verified, owner action named)",
  "humor rules",
];

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

    // Machine gate 6: every evidence block carries its command and its result,
    // and inside the evidence tile the two counts match.
    const blocks = [
      ...pane.matchAll(
        /<div class="evidence">([\s\S]*?)<\/div>\s*(?=<div class="evidence">|<\/div>)/g,
      ),
    ];
    if (blocks.length === 0) {
      out.push(finding("evidence", `pane-${level.id}: no evidence block`));
    }
    blocks.forEach((b, i) => {
      if (!/class="ev-code"/.test(b[1])) {
        out.push(finding("evidence", `pane-${level.id}: evidence block ${i + 1} has no command`));
      }
      if (!/class="ev-result"/.test(b[1])) {
        out.push(
          finding("evidence", `pane-${level.id}: evidence block ${i + 1} has a command with no result`),
        );
      }
    });
    const from = pane.indexOf('data-tile="evidence-blocks"');
    const to = pane.indexOf('data-tile="discrepancies"');
    if (from >= 0 && to > from) {
      const tile = pane.slice(from, to);
      const codes = (tile.match(/class="ev-code"/g) || []).length;
      const results = (tile.match(/class="ev-result"/g) || []).length;
      if (codes !== results) {
        out.push(
          finding(
            "evidence",
            `pane-${level.id}: ${codes} commands and ${results} results in the evidence tile`,
          ),
        );
      }
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
    ran.push("structure", "evidence", "whats-next");
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

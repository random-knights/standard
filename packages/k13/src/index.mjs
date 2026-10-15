// K13 checks: the machine gate of K13 3.0.0, packaged so a report can be
// checked outside the repository that defines it.
//
// K13 3.0.0 asks for one pass, the quick squeeze, and nine gate checks:
//
//   1 figures     every figure in the prose has a source or is derived
//   2 confidence  the confidence is stated, with what it rests on
//   3 plain words no long word, no hype word
//   4 sentences   no long sentence, a short average
//   5 dash        no em dash, no en dash, no double-hyphen surrogate
//   6 cost-line   the AiEDs tile gives energyKWh and gCO2e, or "not reported"
//   7 structure   the twelve tiles, in order
//   8 evidence    every command has its result and every result its command
//   9 whats-next  role and effort, or the completion answer; no model name
//
// The numbers and the tile list are read out of K13.md at run time, not out
// of a copy of it, so the checks move when the standard moves. The rules K13
// names that no code checks are listed in NOT_IMPLEMENTED and the README, so a
// clean result is never read as more than it is.
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
 * The limits table of K13.md "The quick squeeze": the longest word in letters,
 * the longest sentence in words and the average sentence in words. Read from
 * the table so the checker cannot hold a number the standard does not.
 */
export const LIMITS = (() => {
  const body = section("The quick squeeze");
  const grab = (label) => {
    const m = new RegExp(`^\\| ${label} \\| (\\d+) (?:letters|words) \\|`, "m").exec(body);
    if (!m) throw new Error(`K13.md "The limits" has no "${label}" row`);
    return Number(m[1]);
  };
  return {
    longestWord: grab("longest word"),
    longestSentence: grab("longest sentence"),
    averageSentence: grab("average sentence"),
  };
})();

/**
 * Hype words and the long forms K13 replaces. Each is written in K13.md
 * ("The limits", "How to hit the quick squeeze"). A stem matches its endings.
 */
const HYPE = [
  /\brevolutionar(?:y|ies)\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bgame[- ]changing\b/i,
  /\bcutting[- ]edge\b/i,
  /\bunlock(?:s|ed|ing)?\b/i,
  /\butili[sz](?:e|es|ed|ing)\b/i,
  /\bprior to\b/i,
];

/**
 * The twelve tiles in the order K13.md "The report template" lists them.
 * `key` must appear in the K13 list item; `tile` is the data-tile id in the
 * reference HTML template; `md` is the heading in the reference markdown one;
 * `data` marks the tiles whose cells are run data, not prose. The markup names
 * belong to the reference templates; the ORDER and the COUNT come from K13.md
 * and are checked against it below.
 */
const TILE_MARKUP = [
  { key: "header strip", tile: "header-strip", md: "### Report", data: true },
  { key: "finding", tile: "finding", md: "### Finding", data: false },
  { key: "verdict row", tile: "verdict-row", md: "### Verdict", data: false },
  { key: "how it fits", tile: "how-it-fits", md: "### How it fits", data: false },
  { key: "environment card", tile: "environment-card", md: "### Environment", data: true },
  { key: "checks table", tile: "checks-table", md: "### Checks", data: true },
  { key: "evidence blocks", tile: "evidence-blocks", md: "### Evidence", data: true },
  { key: "discrepancies", tile: "discrepancies", md: "### Discrepancies", data: false },
  { key: "what's next", tile: "whats-next", md: "### What's next", data: false },
  { key: "owner actions", tile: "owner-actions", md: "### Owner actions", data: false },
  { key: "what was not done", tile: "what-was-not-done", md: "### What was not done", data: false },
  { key: "aieds disclosure", tile: "aieds-disclosure", md: "### AiEDs disclosure", data: true },
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
  "that the writing is plain beyond the word and sentence limits (a program cannot judge a sentence)",
  "that every claim was actually checked against its source (step 1 and step 13 as process)",
  "that the confidence is the right confidence, only that it is stated with a reason",
  "the thirteen steps as process (cost logged, state verified, owner action named)",
  "the humor rules",
];

function finding(check, message, line) {
  return line === undefined ? { check, message } : { check, message, line };
}

// ---------------------------------------------------------------------------
// Figures (gate check 1).
// ---------------------------------------------------------------------------

const NUMBER_WORDS = new Map(
  ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"].map(
    (w, i) => [w, String(i + 2)],
  ),
);
NUMBER_WORDS.set("zero", "0");

/**
 * Every figure in a text, as a set of strings: digit figures such as "3.0.0"
 * or "12", and spelled numbers from zero to twelve, mapped to digits so "six"
 * and "6" are the same figure. "one" is not read as a figure, because it is
 * also a pronoun ("one of the copies"); a figure of one is therefore out of
 * this check's reach and is listed in the README.
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

const DERIVED = /Derived:\s*([^\s]+)\s+from\s+(.+?)\s+by\s+([^.\n]+)/gi;

/**
 * Gate check 1 on prose. `runFigures` is the run data: the figures the run
 * produced. A figure not in it must be declared in a sentence of the form
 * "Derived: <figure> from <figures> by <how>", whose inputs are run figures or
 * figures derived earlier. The declaration sentences themselves are not read
 * as untraced figures; their inputs are checked instead.
 */
export function checkFigures(prose, runFigures) {
  const known = new Set([...(runFigures ?? [])].map(String));
  const out = [];
  for (const m of prose.matchAll(DERIVED)) {
    const [, fig, inputs, how] = m;
    const outFigs = [...extractFigures(fig)];
    const inFigs = [...extractFigures(inputs)];
    if (outFigs.length === 0) {
      out.push(finding("figures", `a Derived sentence names no figure: "${m[0].trim()}"`));
      continue;
    }
    if (inFigs.length === 0) {
      out.push(finding("figures", `derived figure "${outFigs[0]}" names no input figure`));
    }
    if (how.trim().split(/\s+/).filter(Boolean).length < 1) {
      out.push(finding("figures", `derived figure "${outFigs[0]}" does not say how`));
    }
    for (const f of inFigs) {
      if (!known.has(f)) {
        out.push(finding("figures", `derived figure "${outFigs[0]}" comes from "${f}", which is not in the run data`));
      }
    }
    for (const f of outFigs) known.add(f);
  }
  const body = prose.replace(DERIVED, " ");
  for (const fig of [...extractFigures(body)].sort()) {
    if (!known.has(fig)) {
      out.push(finding("figures", `figure "${fig}" is not in the run data and is not declared derived`));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Confidence (gate check 2).
// ---------------------------------------------------------------------------

/** Gate check 2: "confidence" then high, moderate or low, then "because". */
export function checkConfidence(prose) {
  const flat = prose.replace(/[*_`]/g, "").replace(/\s+/g, " ");
  const ok = /\bconfidence(?:\s+is)?\s*[:,]?\s*(?:high|moderate|low)\b[^.!?]*\bbecause\b/i.test(flat);
  return ok
    ? []
    : [finding("confidence", 'no confidence statement: write "Confidence is high, because ..." (high, moderate or low, and what it rests on)')];
}

// ---------------------------------------------------------------------------
// Plain words and short sentences (gate checks 3 and 4).
// ---------------------------------------------------------------------------

/** Split prose into paragraphs: blank lines and list markers start a new one. */
function paragraphs(prose) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (cur.length) out.push(cur.join(" "));
    cur = [];
  };
  for (const raw of prose.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    if (/^(?:[-*]|\d+[.)])\s+/.test(line)) flush();
    cur.push(line.replace(/^(?:[-*]|\d+[.)])\s+/, ""));
  }
  flush();
  return out;
}

/** The sentences of prose, in order. A code span counts as one word. */
export function sentencesOf(prose) {
  const out = [];
  for (const para of paragraphs(prose)) {
    const text = para
      .replace(/`[^`]*`/g, "code")
      .replace(/https?:\/\/\S+/g, "link")
      .replace(/[*_]{1,3}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text === "") continue;
    for (const s of text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)) {
      const words = s.split(" ").filter((w) => /[A-Za-z0-9]/.test(w));
      if (words.length) out.push({ text: s, words: words.length });
    }
  }
  return out;
}

/**
 * Words checked for length: code spans, quoted terms, links and anything with a
 * digit or a path, version or address character in it are named things, not
 * vocabulary, and are not read.
 */
function plainWordCandidates(prose) {
  const stripped = prose
    .replace(/`[^`]*`/g, " ")
    .replace(/"[^"\n]*"/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  const out = [];
  for (const tok of stripped.split(/\s+/)) {
    if (/[0-9/\\@._:]/.test(tok.replace(/[.,;:!?)]+$/, ""))) continue;
    for (const w of tok.match(/[A-Za-z]+/g) ?? []) out.push(w);
  }
  return out;
}

/** Gate check 3: no word over the letter limit outside a term, and no hype word. */
export function checkPlainWords(prose) {
  const out = [];
  const seen = new Set();
  for (const w of plainWordCandidates(prose)) {
    if (w.length > LIMITS.longestWord && !seen.has(w.toLowerCase())) {
      seen.add(w.toLowerCase());
      out.push(finding("plain-words", `"${w}" is ${w.length} letters; the limit is ${LIMITS.longestWord}. Use a shorter word, or put a technical name in backticks`));
    }
  }
  const flat = prose.replace(/`[^`]*`/g, " ");
  for (const re of HYPE) {
    const m = re.exec(flat);
    if (m) out.push(finding("plain-words", `hype or long-form word "${m[0]}"`));
  }
  return out;
}

/** Gate check 4: no sentence over the word limit, and an average within its limit. */
export function checkSentences(prose) {
  const out = [];
  const ss = sentencesOf(prose);
  for (const s of ss) {
    if (s.words > LIMITS.longestSentence) {
      out.push(
        finding(
          "sentences",
          `a sentence has ${s.words} words; the limit is ${LIMITS.longestSentence}: "${s.text.slice(0, 60)}${s.text.length > 60 ? "..." : ""}"`,
        ),
      );
    }
  }
  if (ss.length) {
    const avg = ss.reduce((n, s) => n + s.words, 0) / ss.length;
    if (avg > LIMITS.averageSentence) {
      out.push(
        finding("sentences", `the average sentence is ${avg.toFixed(1)} words; the limit is ${LIMITS.averageSentence}`),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dashes (gate check 5).
// ---------------------------------------------------------------------------

/**
 * Machine gate 5: no em dash, no en dash, no double-hyphen surrogate.
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

// ---------------------------------------------------------------------------
// Reports in the reference template shape.
//
// A report is parsed into its twelve tiles. The reference markdown template
// opens its pass with "## quick squeeze" and its tiles with "### " headings;
// the reference HTML template wraps the pass in <div id="quick-squeeze"> and
// marks tiles with data-tile. A file in any other shape is not parsed, and the
// shape checks say they were skipped.
// ---------------------------------------------------------------------------

const MD_PASS_HEADING = /^## quick squeeze\b/m;
const HTML_PASS_MARK = 'id="quick-squeeze"';

/** The text of a markdown report's quick squeeze pass, or null. */
function mdPass(text) {
  const m = MD_PASS_HEADING.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + 1);
  const end = rest.indexOf("\n## ");
  return end >= 0 ? rest.slice(0, end) : rest;
}

/** The text of an HTML report's quick squeeze pass, or null. */
function htmlPass(text) {
  const from = text.indexOf(HTML_PASS_MARK);
  return from < 0 ? null : text.slice(from);
}

function htmlToText(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " | ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&middot;/g, ".")
    .replace(/&#?\w+;/g, " ")
    .replace(/[ \t]+/g, " ");
}

/** Split a markdown pass into tile bodies keyed by tile id (first one wins). */
function mdTiles(pass) {
  const tiles = new Map();
  const heads = TILES.map((t) => ({ t, at: pass.indexOf(`\n${t.md}\n`) }));
  const sorted = heads.filter((h) => h.at >= 0).sort((a, b) => a.at - b.at);
  sorted.forEach((h, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1].at : pass.length;
    tiles.set(h.t.tile, pass.slice(h.at + h.t.md.length + 1, end));
  });
  return tiles;
}

/** Split an HTML pass into tile bodies keyed by data-tile id. */
function htmlTiles(pass) {
  const tiles = new Map();
  const parts = pass.split('data-tile="').slice(1);
  for (const p of parts) {
    const id = p.slice(0, p.indexOf('"'));
    if (!tiles.has(id)) tiles.set(id, p.slice(p.indexOf(">") + 1));
  }
  return tiles;
}

/**
 * Parse a report. Returns { format, tiles, order } or null when the document
 * is not in the reference template shape. `tiles` maps tile id to its raw
 * text; `order` lists the tile ids as they appear.
 */
export function parseReport(text, format) {
  if (format === "html") {
    const pass = htmlPass(text);
    if (pass === null) return null;
    const order = [...pass.matchAll(/data-tile="([a-z-]+)"/g)].map((m) => m[1]);
    return { format, pass, tiles: htmlTiles(pass), order };
  }
  const pass = mdPass(text);
  if (pass === null) return null;
  const heads = [...pass.matchAll(/^### .+$/gm)].map((m) => m[0]);
  const order = heads
    .map((h) => TILES.find((t) => t.md === h)?.tile)
    .filter(Boolean);
  return { format: "md", pass, tiles: mdTiles(pass), order };
}

/** The prose and the data of a parsed report. */
function reportParts(rep) {
  let prose = "";
  let data = "";
  for (const t of TILES) {
    const raw = rep.tiles.get(t.tile);
    if (raw === undefined) continue;
    if (rep.format === "html") {
      const body = raw;
      const code = [...body.matchAll(/<(pre|code|table)[\s\S]*?<\/\1>/gi)].map((m) => m[0]).join("\n");
      const rest = body
        .replace(/<(pre|code|table)[\s\S]*?<\/\1>/gi, "\n")
        .replace(/<h\d[\s\S]*?<\/h\d>/gi, " ");
      const proseBody = t.data ? "" : htmlToText(rest.replace(/<\/(p|li|div|h\d)>/gi, "\n"));
      prose += `${proseBody}\n`;
      data += `${htmlToText(t.data ? body : code)}\n`;
    } else {
      const lines = raw.split("\n");
      let fence = false;
      const p = [];
      const d = [];
      for (const l of lines) {
        if (/^\s*(```|~~~)/.test(l)) {
          fence = !fence;
          continue;
        }
        if (fence || /^\s*\|/.test(l) || t.data) d.push(l);
        else p.push(l);
      }
      prose += `${p.join("\n")}\n`;
      data += `${d.join("\n")}\n`;
    }
  }
  return { prose, data };
}

/** Gate checks 7, 8 and 9 for a parsed report. */
function shapeFindings(rep) {
  const out = [];
  const expected = TILES.map((t) => t.tile);
  const label = (id) => (rep.format === "md" ? TILES.find((t) => t.tile === id).md : id);
  const missing = expected.filter((id) => !rep.order.includes(id));
  for (const id of missing) out.push(finding("structure", `missing tile "${label(id)}"`));
  const present = rep.order.filter((id) => expected.includes(id));
  let last = -1;
  for (const id of present) {
    const at = expected.indexOf(id);
    if (at < last) {
      out.push(finding("structure", `"${label(id)}" comes before "${label(expected[last])}"`));
    }
    last = Math.max(last, at);
  }
  if (new Set(present).size !== present.length) {
    out.push(finding("structure", "a tile appears more than once"));
  }

  // Gate 8: every command in the evidence tile has a result and the counts match.
  const ev = rep.tiles.get("evidence-blocks");
  if (ev !== undefined) {
    let codes;
    let results;
    if (rep.format === "html") {
      // Cut with string operations, not a regular expression, so a hostile file
      // cannot make the check run in polynomial time.
      const blocks = ev.split('<div class="evidence">').slice(1);
      if (blocks.length === 0) out.push(finding("evidence", "no evidence block"));
      blocks.forEach((b, i) => {
        if (!b.includes('class="ev-code"')) out.push(finding("evidence", `evidence block ${i + 1} has no command`));
        if (!b.includes('class="ev-result"')) {
          out.push(finding("evidence", `evidence block ${i + 1} has a command with no result`));
        }
      });
      codes = ev.split('class="ev-code"').length - 1;
      results = ev.split('class="ev-result"').length - 1;
    } else {
      codes = ev.split("\nCommand or query:").length - 1 + (ev.startsWith("Command or query:") ? 1 : 0);
      results = ev.split("\nResult:").length - 1 + (ev.startsWith("Result:") ? 1 : 0);
      if (codes === 0) out.push(finding("evidence", "no evidence block"));
    }
    if (codes !== results) {
      out.push(finding("evidence", `${codes} commands and ${results} results in the evidence tile`));
    }
  }

  // Gate 9: What's next.
  const wn = rep.tiles.get("whats-next");
  if (wn !== undefined) {
    const w = rep.format === "html" ? wn : wn;
    const slot = (name) =>
      rep.format === "html" ? w.includes(`>${name}<`) : new RegExp(`\\|\\s*${name}\\s*\\|`).test(w);
    const done = /No next step, this work is complete/.test(w.replace(/\s+/g, " "));
    if (!done) {
      for (const s of ["role", "effort"]) {
        if (!slot(s)) {
          out.push(
            finding(
              "whats-next",
              `What's next has no ${s} slot and does not say "No next step, this work is complete"`,
            ),
          );
        }
      }
    }
    if (/claude|gpt-|gemini|sonnet|opus|haiku|llama|mistral/i.test(w)) {
      out.push(finding("whats-next", "What's next names a model"));
    }
  }
  return out;
}

/** Gate check 6: the AiEDs tile gives energyKWh and gCO2e, each a figure or "not reported". */
export function checkCostLine(tileText) {
  const flat = tileText.replace(/<[^>]+>/g, " | ").replace(/\s+/g, " ");
  const out = [];
  for (const key of ["energyKWh", "gCO2e"]) {
    const re = new RegExp(`${key}[\\s|:*]+(?:[0-9][0-9.,]*|not reported)`, "i");
    if (!re.test(flat)) {
      out.push(finding("cost-line", `the AiEDs tile has no ${key} value (a figure, or the words "not reported")`));
    }
  }
  return out;
}

/** The figures in a block of run data. */
function dataFigures(data) {
  return extractFigures(data.replace(/\|[\s:-]+\|/g, " "));
}

/** Checks 1 to 4 and 6 over a parsed report. */
function contentFindings(rep) {
  const { prose, data } = reportParts(rep);
  const out = [];
  out.push(...checkFigures(prose, dataFigures(data)));
  out.push(...checkConfidence(prose));
  out.push(...checkPlainWords(prose));
  out.push(...checkSentences(prose));
  const aieds = rep.tiles.get("aieds-disclosure");
  out.push(...(aieds === undefined ? [finding("cost-line", "no AiEDs disclosure tile")] : checkCostLine(aieds)));
  return out;
}

/** Checks 1 to 5 over a bare passage and the run figures it came from. */
export function checkPassage(text, runFigures) {
  return [
    ...checkFigures(text, runFigures),
    ...checkConfidence(text),
    ...checkPlainWords(text),
    ...checkSentences(text),
    ...checkDashes(text),
  ];
}

/**
 * The quick squeeze of "One fact, one pass" in K13.md and its run data, read at
 * run time. The worked example is held to its own gate.
 */
export function exampleQuickSqueeze() {
  const body = section("One fact, one pass");
  const quote = body
    .split("\n")
    .filter((l) => l.startsWith("> "))
    .map((l) => l.slice(2))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const run = /^Run data:\s*([\s\S]*?)\n\n/m.exec(body);
  return { passage: quote, runFigures: run ? [...extractFigures(run[1])] : [] };
}

// ---------------------------------------------------------------------------
// Test vectors (packages/k13/vectors).
// ---------------------------------------------------------------------------

function vectorsDir() {
  const p = join(here, "..", "vectors");
  if (!existsSync(p)) throw new Error("vectors/ not found next to this package");
  return p;
}

/**
 * The vector list: a passing and a failing vector per machine gate check.
 * A vector is a bare `passage` with its `runFigures` (checks 1 to 5), or a
 * `report` file, optionally with `replace` pairs that plant one defect in it
 * (checks 6 to 9).
 */
export function loadVectors() {
  const dir = vectorsDir();
  const list = JSON.parse(readFileSync(join(dir, "vectors.json"), "utf8"));
  return list.map((v) => {
    if (v.passageFrom === "K13.md#one-fact-one-pass") {
      const ex = exampleQuickSqueeze();
      return { ...v, passage: ex.passage, runFigures: ex.runFigures };
    }
    if (!v.report) return v;
    let text = readFileSync(join(dir, v.report.file), "utf8");
    for (const [from, to] of v.report.replace ?? []) {
      if (!text.includes(from)) throw new Error(`vector ${v.id}: "${from}" is not in ${v.report.file}`);
      text = text.replace(from, to);
    }
    return { ...v, reportText: text };
  });
}

/**
 * Run the gate check a vector is for and return its findings. A passing
 * vector must return none; a failing one must return a finding whose message
 * contains the vector's `expectMessage`.
 */
export function runVector(v) {
  const only = (names) => (fs) => fs.filter((f) => names.includes(f.check));
  switch (v.gate) {
    case 1:
      return only(["figures"])(checkPassage(v.passage, v.runFigures));
    case 2:
      return only(["confidence"])(checkPassage(v.passage, v.runFigures));
    case 3:
      return only(["plain-words"])(checkPassage(v.passage, v.runFigures));
    case 4:
      return only(["sentences"])(checkPassage(v.passage, v.runFigures));
    case 5:
      return checkDashes(v.passage);
    case 6:
    case 7:
    case 8:
    case 9: {
      const names = { 6: ["cost-line"], 7: ["structure"], 8: ["evidence"], 9: ["whats-next"] }[v.gate];
      return only(names)(checkText(v.reportText, v.report.format).findings);
    }
    default:
      throw new Error(`vector ${v.id}: no gate ${v.gate}`);
  }
}

// ---------------------------------------------------------------------------
// Whole documents.
// ---------------------------------------------------------------------------

/**
 * Check one document. `format` is "md", "html" or "text". The dash check runs
 * on every document. The report checks run only when the document is a report
 * in the reference template shape; otherwise they are listed as skipped. An
 * unfilled template (it still carries FILL markers) runs the shape checks and
 * skips the content checks, which have nothing to read yet.
 */
export function checkText(text, format = "text") {
  const findings = checkDashes(text);
  const ran = ["dash"];
  const skipped = [];
  const rep = format === "md" || format === "html" ? parseReport(text, format) : null;
  if (rep === null) {
    skipped.push("report checks (not a report in the reference template shape)");
  } else {
    findings.push(...shapeFindings(rep));
    ran.push("structure", "evidence", "whats-next");
    if (/\bFILL\b/.test(text)) {
      skipped.push("content checks: figures, confidence, plain-words, sentences, cost-line (unfilled template: FILL markers)");
    } else {
      findings.push(...contentFindings(rep));
      ran.push("figures", "confidence", "plain-words", "sentences", "cost-line");
    }
  }
  return { ok: findings.length === 0, findings, ran, skipped };
}

/** Check one file; the format comes from the extension. */
export function checkFile(path) {
  const text = readFileSync(path, "utf8");
  const format = /\.html?$/i.test(path) ? "html" : /\.(md|markdown)$/i.test(path) ? "md" : "text";
  return { file: path, ...checkText(text, format) };
}

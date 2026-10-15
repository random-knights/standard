// Dogfood gate: K13.md and its companion files are held to the same limits.
//
// K13 3.0.0 sets numeric limits for the quick squeeze (longest word, longest
// sentence, average sentence, no hype word, no dashes). The standard's own
// text is prose a person reads, so it has to pass the same checks it asks of
// everyone else. Left out, because they are data or history and not prose:
// fenced code, tables, headings, the metadata header, terms in backticks or
// double quotes (the checker already skips those), and the 2.x changelog
// entries, which are history and are not rewritten.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIMITS,
  checkDashes,
  checkPlainWords,
  checkSentences,
  plainWordCandidates,
  sentencesOf,
} from "../../packages/k13/src/index.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => readFileSync(resolve(repoRoot, f), "utf8");
const NL = String.fromCharCode(10);

// Owner-approved exceptions to the sentence limit. Each is the exact sentence
// text and the reason. Nothing else may be over the limit.
const EXCEPTIONS = [
  {
    sentence:
      "A quick squeeze and you're hit with a burst of sweet, simple goodness: easy to consume, easy to digest ... and oddly transparent.",
    reason: "owner wording 2026-10-15",
  },
];

/**
 * The prose of a K13 document: outside code fences, tables, headings and the
 * metadata header. `stop` cuts the document at the first line that starts the
 * 2.x history, which is not rewritten.
 */
export function proseOf(src, stop) {
  const cut = stop ? src.indexOf(stop) : -1;
  if (stop) assert.ok(cut > 0, `the document no longer has "${stop}" to stop at`);
  const out = [];
  let fence = false;
  for (const line of (cut > 0 ? src.slice(0, cut) : src).split(NL)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (/^\s*\|/.test(line)) continue; // table row
    if (/^#{1,6} /.test(line)) continue; // heading
    if (/^\*\*[A-Za-z ]+:\*\*/.test(line)) continue; // metadata header
    out.push(line.replace(/^>\s?/, ""));
  }
  let text = out.join(NL);
  // An approved exception is cut out before measuring.
  for (const e of EXCEPTIONS) text = text.replace(e.sentence, " ");
  return text;
}

const DOCS = [
  { file: "K13.md", stop: null },
  { file: "K13-REFERENCE.md", stop: null },
  { file: "CHANGELOG-K13.md", stop: NL + "### 2.2.0" },
];
const prose = Object.fromEntries(DOCS.map((d) => [d.file, proseOf(read(d.file), d.stop)]));

test("K13.md stays small enough to read in five minutes", () => {
  const lines = read("K13.md").split(NL).length;
  assert.ok(lines <= 260, `K13.md is ${lines} lines; the guard is 260. Move detail to K13-REFERENCE.md.`);
});

test("every owner-approved exception is in K13.md word for word", () => {
  for (const e of EXCEPTIONS) {
    assert.ok(read("K13.md").includes(e.sentence), `exception not found: ${e.reason}`);
  }
});

for (const d of DOCS) {
  test(`${d.file} prose meets the quick squeeze limits`, () => {
    assert.deepEqual(LIMITS, { longestWord: 12, longestSentence: 20, averageSentence: 14 });
    assert.deepEqual(checkSentences(prose[d.file]), [], "a sentence or the average is over the limit");
    assert.deepEqual(checkPlainWords(prose[d.file]), [], "a long word or a hype word");
    assert.deepEqual(checkDashes(prose[d.file]), [], "a dash");
  });

  test(`${d.file} prose names no school grade or school stage`, () => {
    assert.doesNotMatch(
      prose[d.file],
      /kindergarten|\bK-5\b|grades?\b|middle school|high school|college|masters|doctorate|\b5th\b|elementary/i,
    );
  });
}

test("measured numbers are printed so a reader can see the margin", () => {
  for (const d of DOCS) {
    const ss = sentencesOf(prose[d.file]);
    const longest = Math.max(...ss.map((s) => s.words));
    const avg = ss.reduce((n, s) => n + s.words, 0) / ss.length;
    const longestWord = Math.max(...plainWordCandidates(prose[d.file]).map((w) => w.length));
    console.log(
      `${d.file}: ${ss.length} sentences, longest ${longest} words, average ${avg.toFixed(1)}, longest word ${longestWord} letters`,
    );
    assert.ok(longest <= LIMITS.longestSentence);
  }
});

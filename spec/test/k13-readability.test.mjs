// Dogfood gate: K13.md is held to its own limits.
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
const text = readFileSync(resolve(repoRoot, "K13.md"), "utf8");

/** The prose of K13.md: outside code fences, tables, headings, metadata and 2.x history. */
export function proseOfK13(src) {
  const cut = src.indexOf("\n### 2.2.0");
  assert.ok(cut > 0, "K13.md no longer has its 2.2.0 changelog entry to stop at");
  const out = [];
  let fence = false;
  for (const line of src.slice(0, cut).split("\n")) {
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
  return out.join("\n");
}

const prose = proseOfK13(text);

test("K13.md's own prose meets the quick squeeze limits", () => {
  assert.deepEqual(LIMITS, { longestWord: 12, longestSentence: 20, averageSentence: 14 });
  assert.deepEqual(checkSentences(prose), [], "a sentence or the average is over the limit");
  assert.deepEqual(checkPlainWords(prose), [], "a long word or a hype word");
  assert.deepEqual(checkDashes(prose), [], "a dash");
});

test("K13.md's own prose names no school grade or school stage", () => {
  assert.doesNotMatch(
    prose,
    /kindergarten|\bK-5\b|grades?\b|middle school|high school|college|masters|doctorate|\b5th\b|elementary/i,
  );
});

test("measured numbers are printed so a reader can see the margin", () => {
  const ss = sentencesOf(prose);
  const longest = Math.max(...ss.map((s) => s.words));
  const avg = ss.reduce((n, s) => n + s.words, 0) / ss.length;
  const words = plainWordCandidates(prose);
  const longestWord = Math.max(...words.map((w) => w.length));
  console.log(
    `K13.md prose: ${ss.length} sentences, longest ${longest} words, average ${avg.toFixed(1)}, longest word ${longestWord} letters`,
  );
  assert.ok(longest <= LIMITS.longestSentence);
});

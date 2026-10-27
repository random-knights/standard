// Dogfood gate: K13.md and its companion files pass the checks they ask of
// everyone else.
//
// K13 4.1.0 holds prose to the voice, which a person judges, and to two checks
// a program can run: no hype word and no dash. The standard's own text is
// prose a person reads, so it has to pass both.
//
// NOT the whole-answer ceiling. K13 4.0.0 "What the ceiling governs" exempts
// reference text by name, this file's three documents included, so the 40-word
// opening and the 400-word body are not applied here. A rule book may be long.
// The line guard below is what keeps this one short. Left out, because they are data or history and not prose:
// fenced code, tables, headings, the metadata header, terms in backticks or
// double quotes (the checker already skips those), and the 2.x changelog
// entries, which are history and are not rewritten.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, checkDashes, checkPlainWords } from "../../packages/k13/src/index.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => readFileSync(resolve(repoRoot, f), "utf8");
const NL = String.fromCharCode(10);

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
  return out.join(NL);
}

const DOCS = [
  { file: "K13.md", stop: null },
  { file: "K13-REFERENCE.md", stop: null },
  { file: "CHANGELOG-K13.md", stop: null },
];
const prose = Object.fromEntries(DOCS.map((d) => [d.file, proseOf(read(d.file), d.stop)]));

// The line guard. It was 260 while K13 was a report standard with four rule
// sections. K13 4.0.0 makes K13 a RESPONSE standard: two modes, eight rules and
// thirteen gate checks, and the owner's rule of 2026-10-23 says a rule that
// cannot be followed without opening a second file is written wrong. So the
// detail that would once have moved to K13-REFERENCE.md now has to stay here,
// and the guard moves with it, once, deliberately. It is still a guard: the
// document may not grow past it without this line changing in a diff.
test("K13.md stays small enough to read in one sitting", () => {
  const lines = read("K13.md").split(NL).length;
  assert.ok(lines <= 345, `K13.md is ${lines} lines; the guard is 345. Cut prose, do not move a rule out.`);
});

for (const d of DOCS) {
  test(`${d.file} prose has no hype word and no dash`, () => {
    assert.deepEqual(LIMITS, { openingWords: 40, bodyWords: 400 });
    assert.deepEqual(checkPlainWords(prose[d.file]), [], "a hype word");
    assert.deepEqual(checkDashes(prose[d.file]), [], "a dash");
  });

  test(`${d.file} prose names no school grade or school stage`, () => {
    assert.doesNotMatch(
      prose[d.file],
      /kindergarten|\bK-5\b|grades?\b|middle school|high school|college|masters|doctorate|\b5th\b|elementary/i,
    );
  });
}

// Served at standard.rand0m.ai/k13/v1/. Nothing served may carry the retired
// reader-level or school framing (owner decision 2026-10-15). Matched on the
// whole file, code and tables included, not only the prose.
const FORBIDDEN = [
  /kindergarten/i,
  /grade/i,
  /school/i,
  /college/i,
  /masters/i,
  /doctorate/i,
  /elementary/i,
  /reading level/i,
  /learning level/i,
  /reader level/i,
  /response level/i,
  /ladder/i,
  /K-5/,
  /12th/i,
];

for (const d of DOCS) {
  test(`${d.file} (served) has none of the forbidden words`, () => {
    const whole = read(d.file);
    const hits = FORBIDDEN.filter((re) => re.test(whole)).map((re) => String(re));
    assert.deepEqual(hits, [], `${d.file} carries retired framing`);
  });
}

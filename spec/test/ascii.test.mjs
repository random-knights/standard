// Gate: every committed text file in this repository is ASCII.
//
// AGENTS.md requires it, and this repository is the one that will carry the
// published standards, so it is the last place that should ship a character a
// consumer's toolchain might mangle. Before this gate the tree held 127
// non-ASCII characters across 12 files, including 45 em dashes and 11 en
// dashes, worst in the ratified methodology itself.
//
// The exception list is deliberately empty. If a future file genuinely needs a
// non-ASCII character, add it here with a reason rather than loosening the
// check.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".firebase"]);
// .html joined this list with the K13 2.0.0 reference templates. Before that
// there was no HTML in the tree, so the gate had never needed to read any, and
// templates/temp1ate.html would have shipped unchecked.
const TEXT = /\.(json|ts|md|mjs|yml|yaml|html)$/;
// Extension-less text files, named explicitly rather than matched by "no dot":
// a broad no-extension rule would also try to read a future binary asset as
// text. LICENSE and LICENSE-DOCS slipped past the extension-based rule above
// until this line; both were checked by hand when added.
// NOTICE joined with the npm packages (lane standard--npm-packages-0922).
const EXTENSIONLESS_TEXT = new Set(["LICENSE", "LICENSE-DOCS", "NOTICE"]);

/** Files allowed to carry a non-ASCII character, each with a stated reason. */
const ALLOWED = new Map([
  [
    "README.md",
    // Owner-supplied family footer and brand mark, at lines 13, 15 and 523.
    // The workspace AGENTS.md names U+1D1A (the reverse R) as the SOLE
    // brand-character exception to ASCII, and allows the owner-supplied family
    // footer to carry its specified emoji. This file has both.
    //
    // It ALSO carries three rotated Latin letters, U+0250, U+026F and U+0279,
    // which spell the brand upside down inside that same footer. Those are
    // footer artwork rather than emoji, so they sit inside the spirit of the
    // AGENTS.md exception and outside its letter. They are allowed here with
    // that stated plainly rather than silently folded into "emoji", and the
    // gap is raised with the owner rather than resolved by this gate.
    //
    // The allowance is for this file only. It covers no other file, and the
    // exception list stays otherwise empty on purpose: a future file that
    // genuinely needs a non-ASCII character gets its own entry and its own
    // reason.
    "owner-supplied family footer: U+1D1A brand mark plus footer emoji and " +
      "rotated-Latin brand artwork (AGENTS.md, Owner ethos)",
  ],
  [
    "assets/icons/site.webmanifest",
    // The installable name is the property name, and the property name
    // carries U+1D1A (owner decision 2026-09-23). A manifest is JSON served
    // as UTF-8, so the literal character is correct there.
    // scripts/build-site.mjs builds the same name from its code point
    // instead, which is why that file needs no entry here.
    //
    // The walk above does not read .webmanifest today. This entry is stated
    // anyway, so that widening TEXT later reports a real drift rather than
    // this sanctioned character.
    "property name: U+1D1A brand mark (AGENTS.md, Owner ethos)",
  ],
]);

// Built from code points rather than written as literals, because this file is
// itself checked by the gate above.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT.test(name) || EXTENSIONLESS_TEXT.has(name)) out.push(full);
  }
  return out;
}

test("no committed text file contains a non-ASCII character", () => {
  const offenders = [];
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).replace(/\\/g, "/");
    if (ALLOWED.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const ch of line) {
        const code = ch.charCodeAt(0);
        if (code > 127) {
          offenders.push(
            `${rel}:${i + 1}: U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
          );
          break;
        }
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `non-ASCII in committed text:\n  ${offenders.join("\n  ")}\n` +
      `Use ASCII: "->" for an arrow, "x" for a multiplication sign, ` +
      `"section" for a section sign, "CO2e" for a subscript, " - " for an ` +
      `em dash, and " to " for a range.`,
  );
});

test("no em dash or en dash anywhere, stated separately", () => {
  // Called out on its own because it is the rule people break most and the
  // one K13 step 13 fails on. A generic ASCII message does not make the fix
  // obvious; this one does.
  const offenders = [];
  for (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).replace(/\\/g, "/");
    const text = readFileSync(file, "utf8");
    if (text.includes(EM_DASH)) offenders.push(`${rel}: em dash`);
    if (text.includes(EN_DASH)) offenders.push(`${rel}: en dash`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

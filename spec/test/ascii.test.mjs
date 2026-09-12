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
const EXTENSIONLESS_TEXT = new Set(["LICENSE", "LICENSE-DOCS"]);

/** Files allowed to carry a non-ASCII character, each with a stated reason. */
const ALLOWED = new Map([]);

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

#!/usr/bin/env node
// Keeps the Claude Code plugin's vendored copy of the AiEDs reference library
// identical to the repository's own build.
//
// WHY A COPY EXISTS. Claude Code installs a plugin by copying its directory
// into a cache. Files outside that directory are not there at run time, so the
// plugin cannot import ../../lib. The plugin therefore carries the two compiled
// library files and the factor table, in the same relative layout the library
// itself expects (lib/dist/factors.js reads ../../spec/v2/aieds-factors.json).
// Nothing is re-implemented: the plugin's numbers are the library's numbers.
//
// WHY A GATE EXISTS. A copy is a second place a coefficient can drift. This
// script is the only writer, and --check (run in CI) fails if the committed copy
// is not byte-identical to a fresh build. It never "fixes" in --check mode.
//
// Usage:
//   cd lib && npm install && npm run build      (once)
//   node scripts/sync-claude-plugin.mjs         write the vendored copy
//   node scripts/sync-claude-plugin.mjs --check fail if it differs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(repoRoot, "plugins", "random-knights");

// [source in the repository, destination under plugins/random-knights/]. The
// three license files travel with the factor table because the table is CC BY
// 4.0 and a redistributed copy must keep its attribution.
export const FILES = [
  ["lib/dist/index.js", "vendor/lib/dist/index.js"],
  ["lib/dist/factors.js", "vendor/lib/dist/factors.js"],
  ["lib/dist/water.js", "vendor/lib/dist/water.js"],
  ["spec/v2/aieds-factors.json", "vendor/spec/v2/aieds-factors.json"],
  ["LICENSE", "LICENSE"],
  ["LICENSE-DOCS", "LICENSE-DOCS"],
  ["NOTICE", "NOTICE"],
];

/** LF-only, so a Windows build (tsc emits CRLF there) matches CI's. */
function lf(buffer) {
  return Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

export function plan() {
  const rows = [];
  for (const [src, dst] of FILES) {
    const from = join(repoRoot, src);
    if (!existsSync(from)) {
      throw new Error(
        `${src} does not exist. Build the library first: cd lib && npm install && npm run build`,
      );
    }
    rows.push({ src, dst, to: join(pluginRoot, dst), want: lf(readFileSync(from)) });
  }
  return rows;
}

function main() {
  const check = process.argv.includes("--check");
  let failed = false;
  for (const row of plan()) {
    const have = existsSync(row.to) ? readFileSync(row.to) : undefined;
    const same = have !== undefined && Buffer.compare(have, row.want) === 0;
    if (check) {
      if (!same) {
        failed = true;
        console.error(`DRIFT ${row.dst} differs from ${row.src}`);
      }
      continue;
    }
    if (!same) {
      mkdirSync(dirname(row.to), { recursive: true });
      writeFileSync(row.to, row.want);
      console.log(`wrote ${row.dst}`);
    }
  }
  if (check) {
    if (failed) {
      console.error(
        "The vendored library copy is stale. Run: node scripts/sync-claude-plugin.mjs",
      );
      process.exit(1);
    }
    console.log("vendored library copy is current");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

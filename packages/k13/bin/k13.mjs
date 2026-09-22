#!/usr/bin/env node
// k13 check <file...>: run the K13 checks this package implements.
//
// Exit codes: 0 every file passed the checks that ran, 1 at least one finding,
// 2 usage error or a file that could not be read.
import { checkFile, K13_VERSION, NOT_IMPLEMENTED } from "../src/index.mjs";

const USAGE = `usage: k13 check [--json] <file...>

Checks each file against the K13 ${K13_VERSION} rules this package implements:
  dash         machine gate 4, every file
  structure    machine gate 5, for .md and .html reports in the reference
               template shape
  evidence     machine gate 6, for .html reports in that shape
  whats-next   the What's next rules, for reports in that shape

Not checked (see the README): ${NOT_IMPLEMENTED.join("; ")}.`;

const args = process.argv.slice(2);
const json = args.includes("--json");
const rest = args.filter((a) => a !== "--json");

if (rest[0] === "--help" || rest[0] === "-h") {
  console.log(USAGE);
  process.exit(0);
}
if (rest[0] === "--version" || rest[0] === "-v") {
  console.log(K13_VERSION);
  process.exit(0);
}
if (rest[0] !== "check" || rest.length < 2) {
  console.error(USAGE);
  process.exit(2);
}

const results = [];
for (const file of rest.slice(1)) {
  try {
    results.push(checkFile(file));
  } catch (err) {
    console.error(`k13: cannot read ${file}: ${err.message}`);
    process.exit(2);
  }
}

if (json) {
  console.log(JSON.stringify({ k13Version: K13_VERSION, results }, null, 2));
} else {
  for (const r of results) {
    for (const f of r.findings) {
      console.log(`${r.file}${f.line ? `:${f.line}` : ""}: ${f.check}: ${f.message}`);
    }
    const skipped = r.skipped.length ? `; skipped: ${r.skipped.join(", ")}` : "";
    console.log(
      `${r.file}: ${r.ok ? "PASS" : `FAIL (${r.findings.length})`}; ran: ${r.ran.join(", ")}${skipped}`,
    );
  }
}
process.exit(results.every((r) => r.ok) ? 0 : 1);

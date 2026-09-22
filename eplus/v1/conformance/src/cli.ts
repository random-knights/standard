#!/usr/bin/env node
/**
 * cli.ts - run the E+ conformance test over a published Earth Health Score
 * document.
 *
 * THE POINT OF THIS SCRIPT IS WHAT IT DOES NOT TOUCH. It reads one JSON
 * document and nothing else: no source grid, no service account, no repository
 * constant, no network call except fetching the document itself. If it prints
 * PASS, a third party holding only that document can reproduce every number in
 * it and every liveness claim it makes.
 *
 *   # the reference implementation's live document (the default target)
 *   npx @randomknights/earthplus
 *
 *   # a local copy, or any other implementation's document
 *   npx @randomknights/earthplus ./some-health-score.json
 *   npx @randomknights/earthplus https://example.test/health-score.json
 *
 *   # promote every standard requirement that is currently a warning into a
 *   # failure. This is the 1.0.0 gate.
 *   npx @randomknights/earthplus --strict
 *
 * Exit code 0 = conformant, 1 = not conformant (every mismatch is printed with
 * the published value, the recomputed value, and why it matters), 2 = the
 * document could not be read at all.
 */
import { readFile } from "node:fs/promises";

import {
  formatConformanceReport,
  verifyPublishedScoreDoc,
} from "./index.js";

/**
 * The reference implementation's published document. It is the default target
 * so that `npx` with no arguments does something useful, and it is the only
 * network address this package knows.
 */
const DEFAULT_DOC_URL =
  "https://storage.googleapis.com/randomknights-xyz.firebasestorage.app/" +
  "earth/score/health-score.json";

async function loadDoc(target: string): Promise<unknown> {
  if (/^https?:\/\//i.test(target)) {
    const res = await fetch(target);
    if (!res.ok) {
      throw new Error(`fetch ${target} failed: HTTP ${res.status}`);
    }
    return (await res.json()) as unknown;
  }
  return JSON.parse(await readFile(target, "utf8")) as unknown;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const target = args.find((a) => !a.startsWith("--")) ?? DEFAULT_DOC_URL;
  let doc: unknown;
  try {
    doc = await loadDoc(target);
  } catch (e) {
    console.error(`eplus-conformance: ${(e as Error).message}`);
    process.exitCode = 2;
    return;
  }
  const result = verifyPublishedScoreDoc(doc, { strict });
  console.log(`source: ${target}`);
  console.log(formatConformanceReport(result));
  if (!result.ok) {
    console.log(
      "\nNOT CONFORMANT. A published headline that cannot be recomputed from " +
        "the published parts, or a liveness claim its own provenance block " +
        "does not support, is not a standard: see E+ methodology sections 5.3 " +
        "and 7.2.",
    );
  }
  // exitCode, not exit(): an in-flight fetch connection is still closing and
  // killing the process on top of it aborts with a libuv assertion.
  process.exitCode = result.ok ? 0 : 1;
}

void main();

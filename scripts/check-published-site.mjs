// check-published-site.mjs - READ ONLY. Is standard.rand0m.ai actually
// serving the versions this repository has ratified?
//
// WHY THIS EXISTS
//
// `firebase deploy --only hosting:standard` publishes `.firebase/standard-
// site`, which is a GITIGNORED BUILD OUTPUT. Deploying without running
// `scripts/build-site.mjs` first ships whatever tree was last built locally.
// It succeeds. It prints a hosting URL. Nothing anywhere says the site did
// not change.
//
// That happened on 2026-09-24. AiEDs 2.4.0 merged as PR #75, the owner ran
// the deploy, and the site kept serving 2.3.0 from a tree built the previous
// evening. CONTRIBUTING.md documents the right three-step sequence; what did
// not exist was any way to notice a step had been skipped. A manual publish
// whose half-completion is invisible is a publish that will silently go stale.
//
// WHAT IT COMPARES, AND WHY NOT MORE
//
// Published `versions.json` semver vs this repo's
// `spec/v2/standard-versions.json`. It fails ONLY when a published version is
// BEHIND the repo.
//
// Byte-comparing the whole tree was the obvious alternative and is wrong here:
// main moves on every merge while publishing is deliberately occasional, so a
// byte check would sit red as a matter of course and be tuned out inside a
// week. A version compare is silent for ordinary merges and loud for exactly
// the thing that went wrong - a ratified standard that never reached the site.
//
// It needs NO CREDENTIALS. It reads a public site and a committed file, which
// is what lets it run on a schedule without putting a production service
// account anywhere near CI.
//
// AHEAD IS NOT A FAILURE. The site serving a version NEWER than this checkout
// means the checkout is behind, not that the site is broken; it is reported
// and does not fail the run.
//
// Usage:
//   node scripts/check-published-site.mjs
//   node scripts/check-published-site.mjs --json
//   node scripts/check-published-site.mjs --base https://stg.standard.rand0m.ai
//
// Exit 0 nothing published is behind. Exit 1 something is. Exit 2 the site
// could not be read at all (network, DNS, outage) - distinct on purpose, so a
// scheduled run can tell "the site is stale" from "I could not look".

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const baseIndex = args.indexOf("--base");
const BASE = baseIndex !== -1 ? args[baseIndex + 1] : "https://standard.rand0m.ai";

const repo = JSON.parse(
  readFileSync(join(root, "spec/v2/standard-versions.json"), "utf8"),
);

// Semver compare on the numeric triple. These are all plain x.y.z; anything
// that is not gets compared as a string and reported rather than guessed at.
function compareSemver(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) {
    return a === b ? 0 : null;
  }
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function main() {
  let live;
  try {
    // Cache-bust: the published versions.json is small and a CDN copy would
    // defeat the entire point of this check.
    const res = await fetch(`${BASE}/versions.json?drift=${Date.now()}`, {
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    live = await res.json();
  } catch (err) {
    const message = `could not read ${BASE}/versions.json: ${err.message}`;
    if (asJson) {
      console.log(JSON.stringify({ base: BASE, unreachable: true, message }, null, 2));
    } else {
      console.error(`UNREACHABLE  ${message}`);
      console.error("This is exit 2, not a drift failure: nothing was compared.");
    }
    return 2;
  }

  const liveById = new Map((live.standards ?? []).map((s) => [s.id, s]));
  const rows = [];

  for (const want of repo.standards ?? []) {
    const got = liveById.get(want.id);
    if (!got) {
      rows.push({ id: want.id, repo: want.semver, live: null, state: "MISSING" });
      continue;
    }
    const cmp = compareSemver(got.semver, want.semver);
    const state =
      cmp === 0 ? "ok"
      : cmp === -1 ? "BEHIND"
      : cmp === 1 ? "ahead"
      : "UNCOMPARABLE";
    rows.push({ id: want.id, repo: want.semver, live: got.semver, state });
  }

  // Published ids this repo does not define are not an error: the site may
  // carry an external listing. Reported so the difference is visible.
  for (const got of live.standards ?? []) {
    if (!(repo.standards ?? []).some((s) => s.id === got.id)) {
      rows.push({ id: got.id, repo: null, live: got.semver, state: "extra" });
    }
  }

  const failing = rows.filter(
    (r) => r.state === "BEHIND" || r.state === "MISSING" || r.state === "UNCOMPARABLE",
  );

  if (asJson) {
    console.log(
      JSON.stringify(
        { base: BASE, checkedAt: new Date().toISOString(), rows, failing: failing.length },
        null,
        2,
      ),
    );
    return failing.length ? 1 : 0;
  }

  console.log(`published site: ${BASE}`);
  console.log("");
  console.log(`  ${"standard".padEnd(14)}${"repo".padEnd(10)}${"live".padEnd(10)}state`);
  for (const r of rows) {
    console.log(
      `  ${String(r.id).padEnd(14)}${String(r.repo ?? "-").padEnd(10)}${String(r.live ?? "-").padEnd(10)}${r.state}`,
    );
  }
  console.log("");

  if (!failing.length) {
    console.log("nothing published is behind this checkout");
    return 0;
  }

  for (const r of failing) {
    if (r.state === "BEHIND") {
      console.error(`BEHIND    ${r.id}: the site serves ${r.live}, this checkout has ${r.repo}`);
    } else if (r.state === "MISSING") {
      console.error(`MISSING   ${r.id}: defined here at ${r.repo}, absent from the published versions.json`);
    } else {
      console.error(`UNCOMPARABLE ${r.id}: repo ${r.repo} vs live ${r.live}`);
    }
  }
  console.error("");
  console.error("The site is serving an older build than this checkout ratified.");
  console.error("Publish with:  npm run publish:site");
  console.error("Do NOT run firebase deploy on its own: hosting:standard serves");
  console.error(".firebase/standard-site, a gitignored build output, so a deploy");
  console.error("without scripts/build-site.mjs first re-ships the previous tree");
  console.error("and reports success.");
  return 1;
}

// process.exitCode, not process.exit(): on Windows, calling process.exit()
// while the fetch handle is still open trips a libuv assertion in async.c and
// the caller sees 127 instead of the code this script chose. Setting the code
// and letting the event loop drain returns the real one.
process.exitCode = await main();

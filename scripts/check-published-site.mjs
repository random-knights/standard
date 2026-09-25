// check-published-site.mjs - READ ONLY. Are the versions this repository has
// ratified actually reachable on every surface a consumer uses?
//
// THREE SURFACES, because a standard is not published until all three agree:
//   site      standard.rand0m.ai        the canonical text and factor tables
//   npm       @randomknights/*          what `npm i` installs
//   releases  GitHub tags/releases      the citable artifact per version
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
// WHY THREE AND NOT ONE. The first version of this script watched the site
// only. On 2026-09-25 an agent on an EXTERNAL machine reported AiEDs "version
// drift". Two of its three claims were wrong - it read methodology section 2.4
// as a version, and lib/package.json's 2.2.0 (the reference library's own
// package version, deliberately distinct) as the methodology version - and one
// was stale. But checking it found this:
//
//   site      2.4.0   correct
//   npm       2.3.0   BEHIND
//   releases  v2.0.0  four versions behind
//
// The site check was green the whole time. That is the same shape as both
// 2026-09-24 incidents: two release paths, one of them unchecked. An outsider
// found the third instance before we did, which is the argument for checking
// every surface rather than the one we happen to remember.
//
// It needs NO CREDENTIALS. Public site, public registry, public repo, and a
// committed file. That is what lets it run on a schedule without putting a
// production service account anywhere near CI. GITHUB_TOKEN is used when
// present only to avoid the unauthenticated rate limit.
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

const REPO = "random-knights/standard";
const PACKAGES = ["aieds", "k13", "earthplus"];

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "cache-control": "no-cache", ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// npm: what `npm i @randomknights/<name>` actually installs, against the
// version committed in packages/<name>/package.json.
async function checkNpm() {
  const rows = [];
  for (const name of PACKAGES) {
    let want;
    try {
      want = JSON.parse(readFileSync(join(root, `packages/${name}/package.json`), "utf8")).version;
    } catch {
      continue; // a package that is not in this repo is not this check's business
    }
    try {
      const meta = await getJson(`https://registry.npmjs.org/@randomknights/${name}/latest`);
      const cmp = compareSemver(meta.version, want);
      rows.push({
        surface: "npm",
        id: `@randomknights/${name}`,
        repo: want,
        live: meta.version,
        state: cmp === 0 ? "ok" : cmp === -1 ? "BEHIND" : cmp === 1 ? "ahead" : "UNCOMPARABLE",
      });
    } catch (err) {
      // A 404 means the package was never published, which is drift, not an
      // outage. Anything else is an outage and must not read as drift.
      const missing = /HTTP 404/.test(err.message);
      rows.push({
        surface: "npm",
        id: `@randomknights/${name}`,
        repo: want,
        live: null,
        state: missing ? "UNPUBLISHED" : "unreachable",
        note: err.message,
      });
    }
  }
  return rows;
}

// releases: methodology.md's own tagging note establishes that each ratified
// version gets an annotated tag so it has a citable artifact. This asks
// whether the CURRENT AiEDs version has one.
//
// It checks only the AiEDs version deliberately. This repo's tag namespace is
// already muddled - v2.3.1 marks a naming commit, not a methodology release -
// so inferring a rule for eplus and k13 from these tags would be inventing
// one. AiEDs is the version the tagging note actually speaks to.
async function checkReleases(aiedsSemver) {
  const headers = process.env.GITHUB_TOKEN
    ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {};
  try {
    const tags = await getJson(`https://api.github.com/repos/${REPO}/tags?per_page=100`, headers);
    const names = new Set(tags.map((t) => t.name));
    const want = `v${aiedsSemver}`;
    return [{
      surface: "releases",
      id: want,
      repo: aiedsSemver,
      live: names.has(want) ? aiedsSemver : null,
      state: names.has(want) ? "ok" : "UNTAGGED",
    }];
  } catch (err) {
    return [{ surface: "releases", id: "tags", repo: aiedsSemver, live: null, state: "unreachable", note: err.message }];
  }
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
      rows.push({ surface: "site", id: want.id, repo: want.semver, live: null, state: "MISSING" });
      continue;
    }
    const cmp = compareSemver(got.semver, want.semver);
    const state =
      cmp === 0 ? "ok"
      : cmp === -1 ? "BEHIND"
      : cmp === 1 ? "ahead"
      : "UNCOMPARABLE";
    rows.push({ surface: "site", id: want.id, repo: want.semver, live: got.semver, state });
  }

  // Published ids this repo does not define are not an error: the site may
  // carry an external listing. Reported so the difference is visible.
  for (const got of live.standards ?? []) {
    if (!(repo.standards ?? []).some((s) => s.id === got.id)) {
      rows.push({ surface: "site", id: got.id, repo: null, live: got.semver, state: "extra" });
    }
  }

  // The AiEDs version this repo claims, used to ask whether a release exists
  // for it. Taken from the committed file, not from the live site, so a stale
  // site cannot make the release check agree with it.
  const aieds = (repo.standards ?? []).find((s) => s.id === "aieds");
  rows.push(...(await checkNpm()));
  if (aieds) rows.push(...(await checkReleases(aieds.semver)));

  const FAIL_STATES = new Set(["BEHIND", "MISSING", "UNCOMPARABLE", "UNPUBLISHED", "UNTAGGED"]);
  const failing = rows.filter((r) => FAIL_STATES.has(r.state));
  // 'unreachable' is never drift. A registry or API blip must not report as a
  // stale release, or the signal gets muted and is gone on the day it matters.
  const unreachable = rows.filter((r) => r.state === "unreachable");

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

  console.log(`site ${BASE}   repo ${REPO}`);
  console.log("");
  console.log(`  ${"surface".padEnd(10)}${"id".padEnd(26)}${"repo".padEnd(10)}${"published".padEnd(12)}state`);
  for (const r of rows) {
    console.log(
      `  ${String(r.surface).padEnd(10)}${String(r.id).padEnd(26)}${String(r.repo ?? "-").padEnd(10)}${String(r.live ?? "-").padEnd(12)}${r.state}`,
    );
  }
  console.log("");
  for (const r of unreachable) {
    console.log(`  could not read ${r.surface}/${r.id}: ${r.note}`);
  }
  if (unreachable.length) console.log("");

  if (!failing.length) {
    console.log("every surface carries what this checkout ratified");
    return 0;
  }

  for (const r of failing) {
    if (r.state === "BEHIND") {
      console.error(`BEHIND       ${r.surface} ${r.id}: serves ${r.live}, this checkout has ${r.repo}`);
    } else if (r.state === "MISSING") {
      console.error(`MISSING      ${r.id}: defined here at ${r.repo}, absent from the published versions.json`);
    } else if (r.state === "UNPUBLISHED") {
      console.error(`UNPUBLISHED  ${r.id}: version ${r.repo} is committed but the package is not on npm`);
    } else if (r.state === "UNTAGGED") {
      console.error(`UNTAGGED     ${r.id}: AiEDs ${r.repo} is ratified but has no release tag`);
    } else {
      console.error(`UNCOMPARABLE ${r.surface} ${r.id}: repo ${r.repo} vs published ${r.live}`);
    }
  }
  console.error("");
  const by = (surface) => failing.some((r) => r.surface === surface);
  if (by("site")) {
    console.error("SITE: publish with  npm run publish:site");
    console.error("  Do NOT run firebase deploy on its own: hosting:standard serves");
    console.error("  .firebase/standard-site, a gitignored build output, so a deploy");
    console.error("  without scripts/build-site.mjs first re-ships the previous tree");
    console.error("  and reports success.");
  }
  if (by("npm")) {
    console.error("NPM: owner action. The npm-publish workflow no-ops until the");
    console.error("  repository variable NPM_TRUSTED_PUBLISHING is 'enabled' and each");
    console.error("  package names this repo and workflow on npmjs.com. See the header");
    console.error("  of .github/workflows/npm-publish.yml for the exact steps.");
  }
  if (by("releases")) {
    console.error("RELEASES: owner action. Cut an annotated tag for the ratified");
    console.error("  version so it has a citable artifact, per the tagging note in");
    console.error("  spec/methodology.md.");
  }
  return 1;
}

// process.exitCode, not process.exit(): on Windows, calling process.exit()
// while the fetch handle is still open trips a libuv assertion in async.c and
// the caller sees 127 instead of the code this script chose. Setting the code
// and letting the event loop drain returns the real one.
process.exitCode = await main();

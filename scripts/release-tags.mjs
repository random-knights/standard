// release-tags.mjs - the pure part of the "releases" surface check. No network,
// no filesystem: it takes the standards this checkout ratified and the tag
// names the repository publishes, and returns rows. check-published-site.mjs
// does the fetching; spec/test/release-tags.test.mjs feeds this fixtures.
//
// ONE REPOSITORY, THREE TAG SERIES. The pre-existing series (v1.0.0 to
// v2.4.0) tracks AiEDs. K13 (2.x) and E+ (1.x) version numbers collide with
// it, so each gets its own prefix. Owner-approved naming (2026-10-15):
//
//   aieds   v<semver>         e.g. v2.4.0        (unchanged)
//   k13     k13-v<semver>     e.g. k13-v2.2.0
//   eplus   eplus-v<semver>   e.g. eplus-v1.2.1
//
// RULE. Same rule as the other surfaces: a series FAILS only when it is
// BEHIND (newest published tag older than the repo version) or has no tag at
// all (UNTAGGED). A newer tag than the checkout is "ahead" and does not fail.
// The AiEDs row is deliberately the original exact-tag test, unchanged.

export const RELEASE_SERIES = [
  { id: "aieds", name: "AiEDs", prefix: "v", exact: true },
  { id: "k13", name: "K13", prefix: "k13-v", exact: false },
  { id: "eplus", name: "E+", prefix: "eplus-v", exact: false },
];

// Semver compare on the numeric triple. Anything that is not x.y.z compares
// as a string and is reported as null (UNCOMPARABLE) rather than guessed at.
export function compareSemver(a, b) {
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

// Every x.y.z published under a prefix. The match is anchored on both ends, so
// "v2.4.0" does not belong to the k13 series and "k13-v2.2.0" does not belong
// to the AiEDs series.
export function versionsForPrefix(tagNames, prefix) {
  const out = [];
  for (const name of tagNames) {
    if (!name.startsWith(prefix)) continue;
    const rest = name.slice(prefix.length);
    if (/^\d+\.\d+\.\d+$/.test(rest)) out.push(rest);
  }
  return out.sort((a, b) => compareSemver(a, b) ?? 0);
}

export function releaseRows(standards, tagNames) {
  const names = new Set(tagNames);
  const rows = [];
  for (const series of RELEASE_SERIES) {
    const std = (standards ?? []).find((s) => s.id === series.id);
    if (!std || !std.semver) continue;
    const id = `${series.prefix}${std.semver}`;
    if (series.exact) {
      rows.push({
        surface: "releases",
        id,
        name: series.name,
        repo: std.semver,
        live: names.has(id) ? std.semver : null,
        state: names.has(id) ? "ok" : "UNTAGGED",
      });
      continue;
    }
    const published = versionsForPrefix(tagNames, series.prefix);
    const newest = published.length ? published[published.length - 1] : null;
    let state = "UNTAGGED";
    if (newest !== null) {
      const cmp = compareSemver(newest, std.semver);
      state = cmp === 0 ? "ok" : cmp === -1 ? "BEHIND" : cmp === 1 ? "ahead" : "UNCOMPARABLE";
    }
    rows.push({ surface: "releases", id, name: series.name, repo: std.semver, live: newest, state });
  }
  return rows;
}

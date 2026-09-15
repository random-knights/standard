# E+ conformance test

Check any published `earth.healthscore.v1` document against the
[E+ methodology](../methodology.md), using nothing but the document itself.

No API key, no account, no access to any producer's source data. If it prints
`PASS`, then anyone holding that one file can reproduce every number in it and
every liveness claim it makes. If it prints `FAIL`, it says which value
disagrees, what it should have been, and which rule was broken.

## Run it in under a minute

```
npx --yes https://codeload.github.com/random-knights/standard/tar.gz/main
```

That checks the reference implementation's live document. To check a different
one, local or remote:

```
npx --yes https://codeload.github.com/random-knights/standard/tar.gz/main ./my-health-score.json
npx --yes https://codeload.github.com/random-knights/standard/tar.gz/main https://example.test/health-score.json
```

A tarball URL rather than `github:random-knights/standard` on purpose: the
`github:` shorthand is resolved by npm through `git clone`, so it needs a git
binary and credentials that reach GitHub. The tarball URL is fetched by npm's
own HTTP client, needs neither, and is verified against a sha512 recorded in
your lockfile.

Or from a clone, with no network at all except fetching the document:

```
git clone https://github.com/random-knights/standard.git
cd standard
node eplus/v1/conformance/out/cli.js ./my-health-score.json
```

The compiled JavaScript under `out/` is committed, so nothing has to be built
to run the checker.

Exit codes: `0` conformant, `1` not conformant, `2` the document could not be
read at all.

Add `--strict` to promote every standard requirement that is currently reported
as a warning into a failure. See "Warnings" below.

## Use it as a library

```
npm install https://codeload.github.com/random-knights/standard/tar.gz/main
```

```js
const { verifyPublishedScoreDoc, formatConformanceReport } =
  require("@random-knights/eplus-conformance");

const result = verifyPublishedScoreDoc(doc);          // or (doc, { strict: true })
if (!result.ok) {
  console.log(formatConformanceReport(result));
  for (const f of result.findings) {
    console.log(f.path, f.published, f.recomputed, f.note);
  }
}
```

The package is CommonJS and ships its own TypeScript declarations. It has zero
runtime dependencies and requires Node 20 or later.

A consumer that needs a reproducible pin should pin a commit rather than a
branch:

```
"@random-knights/eplus-conformance":
  "https://codeload.github.com/random-knights/standard/tar.gz/<full 40-char sha>"
```

The full 40-character sha matters: npm rewrites a short ref on install and the
lockfile then disagrees with what you wrote.

## What it checks

Section numbers are sections of the [E+ methodology](../methodology.md).

| Check | What it proves |
|---|---|
| 1 (7.2) | every `subScores[].weight` equals `meta.weights` for that domain |
| 2 (7.2) | every region `score` is `round1( sum(normalized x weight) / sum(weight) )` |
| 3 (7.2) | every region `confidence` is `round2( availWeight / applicableWeight )`, and a document with no per-region `notApplicableDomains` is rejected |
| 4 (7.2) | `global.score` is `round1( sum(score x exposure) / sum(exposure) )` over the published regions |
| 5 (7.2) | `global.confidence` and `global.measuredCoverage` are the same exposure weighting |
| 6 (7.2) | every `global.subScores[].normalized` is the exposure-weighted mean of the regional values |
| 7 (7.2, 5.2, 5.3) | `meta.isLive`, `meta.notLiveDomains` and every per-domain `fresh` flag follow from the document's own provenance block, and every sub-score repeats the provenance its domain declares |
| 8 (7.2) | any altered published number is rejected |
| 1a (7.1) | `meta.eplusVersion` names the standard version the document conforms to (a warning by default, see below) |
| 9 (6) | the breach panel: nine entries always, state recomputed from the published control value against the published threshold, `breachCount` equal to the transgressed entries and nothing else, `unknown` published rather than omitted, a citation on every entry, and a provisional entry marked as one (a warning only when the document publishes no panel at all, see below) |

Check 9 is what makes the breach panel worth publishing. Section 6 says an
entry's state comes from the published control VALUE against the published
THRESHOLD and never from a domain's normalized health, so the checker
recomputes the state and the `transgressed` flag itself:

```
past       = direction "benefit" ? value < boundary : value > boundary
beyond     = direction "benefit" ? value < highRisk : value > highRisk
state      = not past ? "Safe operating space"
           : beyond   ? "Beyond the boundary"
                      : "Zone of uncertainty"
unknown    <=> the value and transgressed are both absent
```

A producer that read a domain's normalized health instead passes every other
check here and fails this one. That is the audited case: ocean acidification
publishing a health of 94.5, which any band table reads as safe, while its own
published control value of Omega 2.7 is past every published version of its
boundary.

A threshold that publishes no high-risk line cannot place a value BEYOND one,
so a transgression there reads as the zone of uncertainty. That keeps a sourced
absence from becoming an invented severity: the Planetary Health Check 2025
prints a boundary of 0 percent for novel entities and prints no high-risk line.

Check 7 is the one that makes provenance checkable rather than promised.
Section 5.3 states liveness as arithmetic:

```
fresh(domain)  = not synthetic AND ageHours <= freshnessWindowHours AND ageHours >= -1
live(domain)   = not synthetic AND available AND rung in {measured, vendor-published} AND fresh
meta.isLive    = every weight-carrying domain is live
```

so a document that claims `isLive: true` while a weight-carrying domain is
synthetic, unavailable, too weak a rung, or carried forward past the window is
rejected with a message naming the domain and the clause it fails. A document
that is honest about partial live data, `isLive: false` with the reasons
listed, PASSES. Conformance is about whether the document tells the truth about
its inputs, not about whether the inputs are good.

The freshness window is read from the document's own
`meta.freshnessWindowHours`. The checker will not assume a value: assuming one
would be importing a producer constant, which section 7.2 forbids.

## Warnings

A warning is a requirement of the standard that this document does not meet and
that does not fail the run by default. There are two today.

`meta.eplusVersion` (section 7.1 item 1a). The reference implementation does
not emit it yet, so making it fatal would mean the checker could not ship until
the producer caught up, and relaxing the requirement would mean the standard
said one thing and the checker another.

The `boundaries` block (section 6), when the document publishes none at all.
Every document published before the panel existed is in that state, including
the live reference one. A panel that IS published is checked as a failure in
every mode: a document cannot publish a panel and then be graded leniently on
it.

So the gap is printed on every single run, `--strict` turns it into a failure,
and the strict run is the gate that will prove 1.0.0 conformance the day the
field is emitted. The default run does not pretend 1.0.0 conformance exists.

## Where this lives, and why there is only one copy

This is the CANONICAL copy, published from the standard repository under owner
decision D6 (2026-09-13). The reference implementation consumes this package
pinned to a commit; it does not keep a second copy of the checker.

Two copies of one rule is the drift condition this standard's own audits kept
finding. If you are about to copy this file into another repository, that is
the thing the decision exists to stop: pin a commit instead.

The compiled output under `out/` is committed so that installing this package
never runs a compiler, and a test in `test/` rebuilds the source and refuses
any committed output that is not byte-identical to it.

## Develop

```
npm install          # at the repository root
npm run build        # tsc -p eplus/v1/conformance, writes out/
npm test             # node:test, the suite in test/
```

The suite builds minimal documents by hand with the expected arithmetic written
out as literals, so it shares no helper with the code it tests. The
fail-first fixtures for the reference implementation (byte-for-byte copies of
the real 2026-09-10 and 2026-09-11 published documents, where the checker must
fail and name the headline) live beside that producer, because they are
evidence about that implementation rather than about the checker.

## License

Apache-2.0, matching the rest of the tooling in this repository. The
methodology text it implements is CC BY 4.0.

# @randomknights/earthplus

Earth+ (E+), the Earth Health Score standard, version 1.2.0 (ratified
2026-09-22), as an npm package.

## What Earth+ is

Earth+ is how Random Knights scores the health of the planet as one
published document: regional scores built from named, dated data sources
(air, ocean, land cover, fire, cryosphere and more), a headline that is the
exposure-weighted rollup of the published regions, a provenance block that
says which inputs are live, and a breach panel for the planetary boundaries.
The rule that holds it together: anyone holding only the published
`earth.healthscore.v1` document can recompute every number in it and every
liveness claim it makes. This package is the tool that does that
recomputation.

The normative text is the methodology at <https://standard.rand0m.ai>. This
package implements its conformance test (section 7); it does not replace it.

It carries three things, each built from its one canonical file in
[random-knights/standard](https://github.com/random-knights/standard):

| What | Import or command | Source in the repository |
| --- | --- | --- |
| The conformance checker, as a library | `@randomknights/earthplus` | `eplus/v1/conformance/` |
| The same checker as a command | `eplus-conformance` | `eplus/v1/conformance/src/cli.ts` |
| The ratified methodology text | `@randomknights/earthplus/methodology.md` | `eplus/v1/methodology.md` |

There is no JSON Schema for `earth.healthscore.v1`: the checker reads the
document field by field as section 7 describes, and it bundles no schema.

## Install

```
npm install @randomknights/earthplus
```

Node 20 or newer. CommonJS, with TypeScript types. No runtime dependencies,
no keys, no account.

## Check a score document

```
npx @randomknights/earthplus ./health-score.json
npx @randomknights/earthplus https://example.test/health-score.json
npx @randomknights/earthplus --strict ./health-score.json
```

With no argument it checks the reference implementation's live document,
which is the only network address it knows. Exit codes: `0` conformant, `1`
not conformant (every mismatch is printed with the published value, the
recomputed value and the rule), `2` the document could not be read.

`--strict` turns every warning into a failure. A warning is a requirement of
the standard the document does not meet that does not fail the default run:
a missing `meta.eplusVersion`, a missing breach panel, or a synthetic input
in a document that claims a pre-1.2.0 draft.

## Use it as a library

```js
const {
  verifyPublishedScoreDoc,
  formatConformanceReport,
} = require("@randomknights/earthplus");

const result = verifyPublishedScoreDoc(doc); // or (doc, { strict: true })
console.log(formatConformanceReport(result));
if (!result.ok) {
  for (const f of result.findings) {
    console.log(f.path, f.published, f.recomputed, f.note);
  }
}
```

The same works with `import` from an ES module.

## What it checks

Checks 1 to 11 of methodology section 7.2 and the `meta.eplusVersion`
requirement of section 7.1: every sub-score weight, every region score and
confidence, the headline, global confidence and coverage, every global
sub-score, liveness and freshness per domain, the breach panel with its live
and assessed modes, the fire warm-up rule, and that no synthetic input feeds
the score. The table with each check is in the
[conformance README](https://github.com/random-knights/standard/tree/main/eplus/v1/conformance).

## Versions

The package version is the E+ standard version it implements. It is not the
producer's `methodologyVersion`; the methodology, section 9, explains the
difference.

## License

Two licenses, see `NOTICE`:

- The checker code (`dist/`): Apache 2.0, in `LICENSE`.
- The methodology text (`methodology.md`): CC BY 4.0, in `LICENSE-DOCS`.
  Attribute "Random Knights, LLC, E+ Earth Health Score Methodology" with the
  version and a link to <https://standard.rand0m.ai>.

SPDX: `Apache-2.0 AND CC-BY-4.0`.

# Contributing to AiEDs

## What belongs here

- **Schema changes** (`spec/aieds.schema.json`) - new fields, stricter validation, or clarifications. Must remain backward-compatible within a major version.
- **Factor table / methodology updates** (`spec/methodology.md`, `mcp/src/factors.ts`) - new hardware, updated grid intensities, new regions. Owner-ratified (see Governance below).
- **Reference-library changes** (`lib/`) - MUST keep the parity fixture green (it pins the shipped rand0m.ai app's numbers); constant changes are methodology changes (owner-ratified).
- **MCP server fixes and new tools** (`mcp/`) - bug fixes, additional tool parameters, new estimation paths.
- **New conformance examples** (`spec/examples/`) - must be valid against the schema; validate with `node examples/validate.mjs`.

## Out of scope (v1)

The read API/SDK and `.well-known/aieds.json` are deferred to v1.1. Do not add network calls, auth, or external service dependencies to the v1 codebase. The MCP server must remain keyless.

## Dev setup

```bash
# Schema + examples
cd spec
npm install
node examples/validate.mjs      # all 3 examples must pass

# Reference library
cd lib
npm install
npm run build                   # TypeScript -> dist/
npm test                        # parity fixture vs the shipped app + contract tests

# MCP server
cd mcp
npm install
npm run build                   # TypeScript -> dist/
npm test                        # node:test unit tests
```

Gate before submitting: `validate.mjs` passes + `npm run build` clean + `npm test` all green.

## Versioning and governance

AiEDs uses two independent version numbers:

| Version | Where | Meaning |
|---------|-------|---------|
| **Methodology version** | `spec/methodology.md` header + `mcp/src/factors.ts` `METHODOLOGY_VERSION` + `lib/src/index.ts` `METHODOLOGY_VERSION` | Bumped when factor tables or the compute path changes. Semver: patch for table corrections, minor for new factors/regions, major for path changes. |
| **Schema version** | `spec/aieds.schema.json` `$id` URI | Bumped when the disclosure shape changes (new required fields = major; new optional fields = minor). |

**Factor table / methodology changes are owner-ratified.** The rule (mirroring ADR 0008):

1. Open a PR with the proposed change and a CHANGELOG entry.
2. The PR must update `methodology.md`, `mcp/src/factors.ts`, and the CHANGELOG in `methodology.md` atomically.
3. All existing conformance examples must still pass (or be updated with rationale).
4. An owner merges - no silent drift via unreviewed commits.

Schema-only changes (documentation, stricter patterns) can be merged by any maintainer after CI passes.

## Releasing

Two things are released from this repository: the npm packages and the
standard.rand0m.ai site. Merging to `main` deploys only the staging site;
npm packages and the production site are released separately.

### npm packages

Three packages are built from `packages/`, each staged at pack time from its
canonical files by `scripts/stage-npm-package.mjs`:

| Package | Version source | Contents |
|---------|----------------|----------|
| `@randomknights/aieds` | `spec/methodology.md` | reference library, JSON Schema, coefficient tables |
| `@randomknights/k13` | `K13.md` | K13 text and the `k13 check` CLI |
| `@randomknights/earthplus` | `eplus/v1/methodology.md` | E+ conformance checker (library and `eplus-conformance` CLI) and the E+ methodology text |

Nothing else is published. The repository root, `lib/` and `mcp/` are marked
`"private": true` and are never published; `lib/` and `spec/` reach npm only
inside `@randomknights/aieds`, and the E+ checker only inside
`@randomknights/earthplus`. The old `@random-knights/*` scope is retired.

1. Land the change on `main` via PR with CI green. The `packages` CI job packs
   every package, holds each tarball to an exact file list, installs it into
   an empty project, smoke tests it, and runs `npm publish --dry-run`.
2. Bump the version in `packages/<name>/package.json` to the version of the
   standard it carries, on `main`, via PR. npm refuses to publish over an
   existing version.
3. Publish with the `npm publish` workflow
   (`.github/workflows/npm-publish.yml`, manual dispatch from `main`, choose
   the package). It uses npm trusted publishing with provenance; there is no
   npm token anywhere. It runs only once the repository variable
   `NPM_TRUSTED_PUBLISHING` is `enabled` and the package on npmjs.com names
   this repository, that workflow file and the `npm-publish` environment as
   its trusted publisher. A package's very first version is published by the
   owner by hand, because a trusted publisher can only be added to a package
   that already exists.

Publishing is owner-only.

### The standard.rand0m.ai site

The machine-artifact host is Firebase Hosting (project `randomknights-xyz`,
hosting target `standard`, site `standard-rand0m-ai`; `firebase.json` and
`.firebaserc` are in this repo). Staging deploys automatically on merge to
main: `.github/workflows/80-staging-deploy.yml` builds the site, runs the
same `site-output.test.mjs` gate this section describes below, deploys it
to `abc-standard-rand0m-ai` in the `randomknights-abc` project, and proves
the served bytes match before the run is called green. It is reachable at
`https://abc-standard-rand0m-ai.web.app` and at the custom hostname
`https://stg.standard.rand0m.ai`.

Production remains a separate, owner-only deploy. From a clean checkout of
`main`, owner identity only:

```
npm run publish:site
```

That runs the build, the gate, the deploy and a verification of the LIVE site,
in that order, and stops at the first failure.

RUN IT AS ONE COMMAND. The three steps it wraps used to be copied out
separately, and on 2026-09-24 only the last one was. `hosting:standard`
publishes `.firebase/standard-site`, a GITIGNORED build output, so a deploy
without `scripts/build-site.mjs` first re-ships the tree that was last built
locally, prints a hosting URL and exits 0. AiEDs 2.4.0 had merged; the site
kept serving 2.3.0, and nothing anywhere said so.

To check whether the live site is behind this checkout, at any time, with no
credentials:

```
npm run check:published
```

`.github/workflows/85-published-drift.yml` runs that daily. It compares THREE
release surfaces to this repository and fails only when one is BEHIND, so an
ordinary merge does not make it red. It holds no production credential;
publishing is still an owner act.

| Surface | What it is | How it is fixed |
|---------|------------|-----------------|
| site | `standard.rand0m.ai`, the canonical text and factor tables | `npm run publish:site` |
| npm | what `npm i @randomknights/...` installs | owner; see `.github/workflows/npm-publish.yml` |
| releases | the citable tag per ratified version | owner; annotated tag, per the tagging note in `spec/methodology.md` |

A standard is not published until all three agree. The check watched the site
alone until 2026-09-25, when an outside reader found npm serving AiEDs 2.3.0
and the releases stopped at v2.0.0 while the site was correctly on 2.4.0. The
site check was green the whole time.

`npm test` in `spec/` runs `test/site-output.test.mjs`, which rebuilds the
tree and refuses if any served file is not byte-identical to its repo source
or if a promised artifact is missing. Do not deploy from a tree where that
test is red, and never deploy from a checkout that was not made with the
repo's `.gitattributes` in force: on 2026-08-31 a hand deploy from such a
working copy shipped the schema as CRLF, so its download hash never matched
the repo, and left `aieds-factors.json` and `methodology.md` at 404.

Verify after deploying. Both hashes must be equal:

```
curl -s https://standard.rand0m.ai/aieds/v2/aieds.schema.json | sha256sum
git show main:spec/aieds.schema.json | sha256sum
curl -sI https://standard.rand0m.ai/aieds/v2/aieds-factors.json | head -1
```

## Keyless rule

The MCP server (`mcp/`) must never require an API key, auth token, environment secret, or private dependency. It reads only `spec/aieds.schema.json` (bundled in the repo) and emits deterministic results from factor tables. Any PR that adds a network call, secret, or private package will be rejected.

## License of contributions

By contributing you agree that your contribution is licensed under the file
that covers the path you changed, as listed at the end of
[LICENSE](LICENSE) and [LICENSE-DOCS](LICENSE-DOCS) and summarized in
[NOTICE](NOTICE):

- Apache 2.0 under [LICENSE](LICENSE): code and the schema, including `lib/`,
  `mcp/` (except its README), `spec/aieds.schema.json`, the E+ conformance
  checker in `eplus/v1/conformance/` (except its README), `templates/`,
  `scripts/`, `packages/` (except the READMEs) and `.github/`.
- CC BY 4.0 under [LICENSE-DOCS](LICENSE-DOCS): the standards' text and data,
  including `K13.md`, `spec/methodology.md`, `spec/v2/aieds-factors.json`,
  `spec/v2/standard-versions.json`, `spec/examples/*.json`,
  `eplus/v1/methodology.md`, and the repository documentation.

A path listed in neither file follows the same split: code is Apache 2.0,
prose and data are CC BY 4.0.

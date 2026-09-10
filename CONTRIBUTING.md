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

## Deploying the site

Nothing auto-deploys. Publishing is deliberate and manual:

1. Land the change on `main` via PR with CI green.
2. Bump the version in the surface you are releasing (`lib/package.json` or
   `mcp/package.json`) and the methodology version in `spec/methodology.md` if
   the model changed.
3. Publish from a clean checkout of `main`, from inside that surface:
   `npm publish`. Requires an npm token; see Secrets below.

There is no staging. The spec IS the artifact.

### The standard.rand0m.ai site

The machine-artifact host is Firebase Hosting (project `randomknights-xyz`,
hosting target `standard`, site `standard-rand0m-ai`; `firebase.json` and
`.firebaserc` are in this repo). It has no staging tier and nothing deploys
it automatically. Deploy from a clean checkout of `main`, owner identity
only:

```
node scripts/build-site.mjs
cd spec && npm test && cd ..
firebase deploy --only hosting:standard --project randomknights-xyz
```

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

By contributing you agree that your contributions to `spec/aieds.schema.json`, `lib/`, and `mcp/` are licensed Apache 2.0 under [LICENSE](LICENSE), and contributions to `spec/methodology.md`, `spec/examples/`, and `spec/v2/aieds-factors.json` are licensed CC BY 4.0 under [LICENSE-DOCS](LICENSE-DOCS).

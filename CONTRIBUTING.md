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

## Keyless rule

The MCP server (`mcp/`) must never require an API key, auth token, environment secret, or private dependency. It reads only `spec/aieds.schema.json` (bundled in the repo) and emits deterministic results from factor tables. Any PR that adds a network call, secret, or private package will be rejected.

## License of contributions

By contributing you agree that your contributions to `spec/aieds.schema.json`, `lib/`, and `mcp/` are licensed Apache 2.0 under [LICENSE](LICENSE), and contributions to `spec/methodology.md`, `spec/examples/`, and `spec/v2/aieds-factors.json` are licensed CC BY 4.0 under [LICENSE-DOCS](LICENSE-DOCS).

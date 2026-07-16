# RUNBOOK - aieds (human operator)

For agent rules see `CODEX.md`. This file is for a human with a terminal.

## What this is

An open standard, not a deployed service. There is no server to roll back.
"Shipping" here means cutting a version of the spec and the two npm projects
that implement it.

## The one thing to know first

**The default branch is `master`, not `main`.** Most of the org is `main`.
Commands copy-pasted from another repo will silently target a branch that does
not exist here. This is not cosmetic: `ci.yml` filtered pushes on `[main]`
from day one, so no push to `master` ever ran CI, and `lib/` drifted a whole
major version with no failing signal. Fixed 2026-07-16; keep it in sync.

## Layout

  spec/   JSON Schema + methodology + conformance examples
  lib/    reference library (TypeScript)
  mcp/    keyless MCP server

Each is a separate npm project. There is no root `package.json`; you must `cd`
into the surface you are working on.

## Quick start

```
cd lib && npm install && npm run build && npm test
cd ../mcp && npm install && npm run build && npm test
cd ../spec && npm install && node examples/validate.mjs
```

## How to deploy

Nothing auto-deploys. Publishing is deliberate and manual:

1. Land the change on `master` via PR with CI green.
2. Bump the version in the surface you are releasing (`lib/package.json` or
   `mcp/package.json`) and the methodology version in `spec/methodology.md` if
   the model changed.
3. Publish from a clean checkout of `master`, from inside that surface:
   `npm publish`. Requires an npm token; see Secrets below.

There is no staging. The spec IS the artifact.

## How to roll back

- **Bad commit on master:** open a revert PR. Never force-push master; the org
  ruleset blocks non-fast-forward and deletion on the default branch.
- **Bad npm publish:** do NOT rely on `npm unpublish` (it is restricted after
  24h and breaks consumers). Publish a corrected patch version and, if the bad
  version is actively harmful, `npm deprecate <pkg>@<version> "<reason>"`.
- **Bad methodology version:** supersede it in `spec/methodology.md` with an
  explicit "SUPERSEDED, do not implement" banner, the way 1.x was superseded.
  Do not delete the old text; implementers need to know why it is wrong.

## Where secrets live

- **Nothing secret is needed to build, test, or run this repo.** The MCP server
  is deliberately keyless. If a change starts requiring an API key to run tests,
  that is a design smell - push back before adding one.
- npm publish token: owner-only, not in this repo and not in CI. CI never
  publishes.
- Org-wide: live keys are owner-laptop only at `C:\rand0m\.secrets\`, never
  inside a repo. Never commit or print one.

## What breaks and how to fix it

| Symptom | Cause | Fix |
|---|---|---|
| CI green but bad code on master | push-CI filter targeted `[main]` while default is `master` | Fixed 2026-07-16. If it recurs, check `on.push.branches` in `ci.yml` matches the default branch. |
| `spec` job fails on `validate.mjs` | an example no longer matches `aieds.schema.json` | Fix the example, or the schema if the schema is genuinely wrong. Do not loosen the schema to make a bad example pass. |
| `lib` and the app disagree on a number | a coefficient changed on one side only | `lib/` must byte-mirror rand0m.ai. Reconcile the coefficient; do not paper over with rounding. |
| Someone "restores" 1.x behaviour | 1.x looks like the stable base by version number | Reject. 1.x is superseded and wrong (flat 0.30 gCO2e/1k tokens, carbon-first). 2.0.0 is energy-first. |
| `npm install` drift between surfaces | three independent lockfiles | Install per surface. Do not add a root package.json to "unify" them without a plan for all three. |

## Escalation

Prod-affecting questions about the rand0m.ai app itself belong in `xyz`, not
here. This repo defines the standard; the app implements it.

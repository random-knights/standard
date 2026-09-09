# RUNBOOK - standard (human operator)

This repository has no repo-local AGENTS.md; see CONTRIBUTING.md for what belongs where and the contribution process. This file is for a human with a terminal.

## What this is

An open standard, not a deployed service. There is no server to roll back.
"Shipping" here means cutting a version of the spec and the two npm projects
that implement it.

## The one thing to know first

**The default branch is `main`.** It was `master` from the initial scaffold
until 2026-08-26; `ci.yml` filtered pushes on `[main]` from day one while the
default was `master`, so no push ever ran CI and `lib/` drifted a whole major
version with no failing signal, fixed 2026-07-16 by pointing the filter at
the actual default. Renaming the branch on 2026-08-26 removed the mismatch
rather than papering over it again. If this repo is ever renamed or forked,
check `on.push.branches` in `ci.yml` matches the default branch before
trusting a green push.

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

## How to roll back

- **Bad commit on main:** open a revert PR. Never force-push main; the org
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
- Org-wide: live keys are owner-laptop only, in a local secrets directory kept
  outside every repo's working tree. Never commit or print one.

## What breaks and how to fix it

| Symptom | Cause | Fix |
|---|---|---|
| CI green but bad code merged (2026-07-16, historical) | push-CI filter targeted `[main]` while the default branch was `master` | Fixed by pointing the filter at the actual default; superseded 2026-08-26 when the default branch was renamed to `main`, removing the mismatch. If a rename happens again, check `on.push.branches` in `ci.yml` matches the default branch. |
| `spec` job fails on `validate.mjs` | an example no longer matches `aieds.schema.json` | Fix the example, or the schema if the schema is genuinely wrong. Do not loosen the schema to make a bad example pass. |
| `lib` and the app disagree on a number | a coefficient changed on one side only | `lib/` must byte-mirror rand0m.ai. Reconcile the coefficient; do not paper over with rounding. |
| Someone "restores" 1.x behaviour | 1.x looks like the stable base by version number | Reject. 1.x is superseded and wrong (flat 0.30 gCO2e/1k tokens, carbon-first). 2.0.0 is energy-first. |
| `npm install` drift between surfaces | three independent lockfiles | Install per surface. Do not add a root package.json to "unify" them without a plan for all three. |

## Escalation

Prod-affecting questions about the rand0m.ai app itself belong in `xyz`, not
here. This repo defines the standard; the app implements it.

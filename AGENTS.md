# AGENTS - agent rules for aieds

Canonical rules live in `C:\rand0m\AGENTS.md` (the working-root standard). This
file restates the rules an agent MUST follow here, plus the specifics of this
repo. If the two ever disagree, the working-root standard wins.

## Owner ethos

- The owner approves; agents execute end to end (implement, commit, push, PR,
  green CI). Never fake a green run: no retries, skips, or relaxed assertions
  to hide a real failure.
- Credentials are owner-only. Agents never create, read into chat, print, or
  commit a secret.
- Reversible cleanup only: park or quarantine, never hard-delete.
- ASCII, no em dashes, in committed text.
- Repo changes ship via PR. The default branch is protected by the org
  ruleset `default-branch-protection` (PR required, 0 required reviewers).

## Concurrency - IMPORTANT

At most ONE write-lane per repo at a time. Parallelize ACROSS repos, never
WITHIN one.

Why: every repo under `C:\rand0m` is a fresh clone sharing per-repo git
worktrees. Two write-lanes in one repo has repeatedly caused mid-edit on-disk
file changes, commits tangling onto another agent's branch, and .git metadata
corruption (NUL-padded config/packed-refs, stale index.lock).

- Before a write-lane, check whether another lane is already writing this repo.
  If so, wait or pick a different repo.
- Read-only lanes (audits, discovery, gh status reads) may run alongside
  anything.
- If you hit a shared-worktree conflict mid-task: STOP. Verify `git status` and
  `git diff` contain only YOUR changes and HEAD is on YOUR branch before
  committing. Never commit a tangled tree.
- `xyz-docs` is the highest-risk repo org-wide; serialize writes to it.

## Toolchain

This repo is Node/TypeScript only (Node 20 in CI); it needs no Flutter SDK.
For org context: Flutter 3.38.3 lives at `C:\flutter`, `C:\flutter\bin` is on
the USER PATH. Never use `setx` to edit that PATH - it is over the 1024-char
setx cap and truncates silently.

## This repo

`aieds` is the AI Energy Disclosure Standard: an open schema plus reference
tooling. Three surfaces, each with its own npm project and its own CI job:

  spec/   JSON Schema + methodology + conformance examples
  lib/    reference library (TypeScript): tokens + model in, disclosure out
  mcp/    keyless MCP server exposing aieds_estimate/factors/disclose

Rules specific to aieds:

- **The default branch is `master`, not `main`.** This is the one repo in the
  org (with `xyz-tools`) where that is true. Any workflow branch filter, any
  script, any doc that assumes `main` is a bug here. This exact mistake sat in
  `ci.yml` and silently disabled push-CI for the whole life of the repo.
- methodology 2.0.0 is CURRENT. 1.x is SUPERSEDED and must not be implemented
  or "restored" - it specified a flat 0.30 gCO2e/1k tokens for every model and
  derived energy backward from carbon. Both are wrong. Energy-first only.
- `lib/` must byte-mirror the rand0m.ai app's numbers. If you change a
  coefficient, the app and the standard must agree to the number, or the
  disclosure is a lie.
- AIEDS scope is device/usage/inference/training. It is NOT the planetary
  Earth Health Score (`rand0m.ai/earthHealthScoreRefresh`). Do not merge the
  two models.

## CI

`.github/workflows/ci.yml` is the only workflow. Three jobs (spec, mcp, lib)
on PR and on push to master. See `RUNBOOK.md` for what breaks and how to fix.

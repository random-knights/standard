# Agent rules (aieds)

**Read `../AGENTS.md` in this repo root and follow it. It is the authority for
this repo.** Canonical org rules live in `C:\rand0m\CODEX.md`; the repo CODEX
restates them and adds the local specifics.

The three that bite hardest here:

1. **The default branch is `master`, not `main`.** Anything assuming `main` is
   a bug in this repo. That exact bug silently disabled push-CI for the life of
   the repo and let `lib/` rot a major version.
2. **ONE write-lane per repo.** Parallelize across repos, never within one.
   Concurrent lanes here have corrupted .git metadata and tangled commits.
3. **methodology 2.0.0 is current; 1.x is superseded and wrong.** Energy-first,
   never carbon-first. Never fake a green CI run.

Credentials are owner-only: never create, print, or commit a secret. Nothing
secret is required to build or test this repo.

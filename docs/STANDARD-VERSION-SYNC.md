# Standard version sync: how it works, and the one step only the owner can do

The same four-row STANDARD table is rendered in six places: the README template,
the org profile page, and the READMEs of `abc`, `r1-01` and `xyz-earth`. This is
how those stay true without anybody retyping a version.

## What broke, so the design is not abstract

On 2026-09-15 the published site at `standard.rand0m.ai` announced **K13 at
version 1.1.0**. `K13.md` said 2.0.0. `CITATION.k13.cff` said 2.0.0. The
template, the org profile and three repo READMEs all said 2.0.0. The site was
wrong about its own subject by a full major version.

The cause was one line. `scripts/build-site.mjs` derived the AiEDs version from
`spec/methodology.md` and the E+ version from `eplus/v1/methodology.md`, and
carried K13 as a literal:

```js
const K13 = { name: "K13", version: "1.1.0", ... }
```

`spec/test/build-site.test.mjs` already gated E+ against the version its own
text declares. K13 had no such gate. Nothing compared the literal to the
document, so nothing caught it.

At the same time two of the six README copies had drifted on the DESCRIPTION
column, saying "AI Summary Reporting" where the others said "AI Response
Summary". Nobody noticed, because the description is the column nobody rereads.

## The shape of the fix

```
  K13.md                     spec/methodology.md      eplus/v1/methodology.md
        \                            |                        /
         \                           |                       /
          +--- scripts/emit-standard-versions.mjs -----------+
                             |
                spec/v2/standard-versions.json      (committed, gated)
                             |
                standard.rand0m.ai/versions.json    (served byte-identical)
                             |
      +----------------------+----------------------+
      |                      |                      |
  drift CHECK            fan-out WRITE          the template
  (every consumer,       (this repo, on a       (owner edits by
   on every PR,          release, opens PRs)     hand; it is the
   no credential)                                design source)
```

Three rules make it hold:

1. **A version is a fact about a document.** Every version in
   `standard-versions.json` is parsed out of the document that defines it.
   `spec/test/standard-versions.test.mjs` re-derives the file and fails on a
   byte difference, so the committed copy cannot be hand-edited into a lie.
2. **The table is delimited, not pattern-matched.** Consumers wrap the block in
   `<!-- STANDARD:BEGIN -->` and `<!-- STANDARD:END -->`. The sync script
   rewrites what is between them and never tries to parse a markdown table,
   because parsing the table is how the description column drifted.
3. **Nothing merges itself.** The fan-out opens pull requests. You merge.

## Where each piece lives, and why

| Piece | Repo | Credential |
|---|---|---|
| `scripts/emit-standard-versions.mjs`, `spec/v2/standard-versions.json`, the gate | standard | none |
| `scripts/sync-standard-versions.mjs` (the logic, one copy) | .github | none |
| `standard-versions.yml` (reusable drift check) | .github | none |
| `standard-versions-check.yml` (caller) | each consumer | none |
| `standard-versions-fanout.yml` (opens the PRs) | standard | the App |

The fan-out is here and not in `.github` for a stated reason: `.github/AGENTS.md`
says nothing private, internal or secret belongs in that repo and that no
workflow there takes a secret. A `workflow_call` declaring a secret is a
workflow taking a secret. So `.github` holds the script and the no-credential
check, and the half that writes lives where the triggering event happens.

## THE OWNER STEP: create the GitHub App

An agent must never mint a credential, so this part is yours. It is about twenty
minutes and it is done once.

**Why an App rather than a personal access token.** A fine-grained PAT belongs
to a person, expires on a date nobody has in their calendar, and makes machine
edits look human in the audit log. An App is owned by the organisation, survives
people, and mints a token per run that expires within the hour, so the only
stored secret is a private key that does not rotate on a schedule. Its pull
requests arrive from `standard-sync[bot]`, which is the point: the table is
supposed to be visibly not hand-maintained.

**Why not the built-in `GITHUB_TOKEN`.** It cannot write to another repository
at all, and a pull request opened with it does not trigger workflows, so the
required `CI Gate` check would never run and the pull request could never merge.

### Steps

1. Go to **github.com/organizations/random-knights/settings/apps** and choose
   **New GitHub App**.
2. Name it `standard-sync`. Homepage `https://standard.rand0m.ai`.
3. **Uncheck Webhook Active.** This App is driven by Actions, not by webhooks.
4. Repository permissions, and nothing else:
   - **Contents: Read and write** (to push the branch)
   - **Pull requests: Read and write** (to open the pull request)
   Leave every other permission at No access. Grant no account permissions.
5. **Where can this App be installed: Only on this account.**
6. Create it, then **Generate a private key**. A `.pem` downloads. That file is
   the credential: do not commit it, do not paste it anywhere but the secret
   field below.
7. Note the **App ID** from the App settings page.
8. **Install App**, and choose **Only select repositories**:
   `.github`, `abc`, `r1-01`, `xyz-earth`. Do NOT select all repositories.
   The fan-out also names this exact list, so a wider install grants access
   nothing uses.
9. Add two secrets. Organisation secrets at
   **github.com/organizations/random-knights/settings/secrets/actions**, scoped
   to the `standard` repository, or repository secrets on `standard` directly:
   - `RK_SYNC_APP_ID` = the App ID from step 7
   - `RK_SYNC_APP_PRIVATE_KEY` = the entire contents of the `.pem`, including
     the `-----BEGIN` and `-----END` lines
10. Delete the downloaded `.pem` from your machine. GitHub cannot show it again,
    and if it is ever needed you generate a new key rather than keeping this one
    lying about.

### Check it worked, without waiting for a release

Run the fan-out by hand in dry-run mode. It reports what it would change and
opens nothing:

```
gh workflow run standard-versions-fanout.yml --repo random-knights/standard -f dry-run=true
```

Then look at the run. With the App configured it clones each consumer and prints
a diff or says "already in sync". Without it, it prints a notice naming this
document and succeeds anyway, because a release must not go red over a
credential that has not been created yet.

## Day to day

- **Moving a version:** edit the version in the document that defines it
  (`K13.md`, `spec/methodology.md`, `eplus/v1/methodology.md`), run
  `node scripts/emit-standard-versions.mjs`, and commit both. The gate will
  fail if you skip the regeneration.
- **On the next release:** the fan-out opens a pull request in each consumer.
  Review and merge them.
- **If a consumer is hand-edited anyway:** its own `Standard versions check`
  fails on the pull request that does it. That check needs no credential, so it
  works whether or not the App exists.
- **The template** at `_templates/README-public.md` is the design source and is
  edited by hand. The generated block is byte-identical to the table in it,
  which is how the generator was checked in the first place.

## What this does NOT do

- It does not touch the emoji column. Those marks live in the sync script, not
  in `standard-versions.json`, because that file is walked by an ASCII gate with
  a deliberately near-empty exception list. The marks are decoration and they do
  not change; the versions do.
- It does not merge anything, ever.
- It does not deploy the site. `standard.rand0m.ai` is published by hand from a
  clean checkout of `main`, owner identity only, per CONTRIBUTING.md. **Until
  that deploy happens the live page keeps whatever it last had**, which is how a
  stale K13 version survived on it.
- It does not cover private repos. The private README template carries no
  STANDARD block, so there is nothing there to sync.

# Security policy

This repository holds the AiEDs standard, its reference library, the
`@randomknights/aieds` npm package and its `aieds` command, the Claude Code
and Codex plugin in `plugins/random-knights`, and an MCP server in `mcp`.

## Report a vulnerability

Report it privately through GitHub. On this repository, open the **Security**
tab and choose **Report a vulnerability**. That opens a private advisory that
only the maintainers can read.

Please do not open a public issue for a vulnerability.

A useful report says:

- what is affected (the npm package, the plugin, the MCP server or the site),
  and its version;
- how to reproduce it, in steps;
- what an attacker gains.

Do not include prompts, replies, tokens or other private data. A made-up
example is enough.

We will tell you whether we can reproduce the problem and what we plan to do.

## Supported versions

Fixes go into the newest release only.

| What | Supported |
| ---- | --------- |
| AiEDs 2.5.x: the methodology, `@randomknights/aieds` on npm and the plugin that ships with it | Yes |
| AiEDs 2.0.0 to 2.4.0 | No. Records made under them stay valid; update to get fixes. |
| AiEDs 1.x | No. Superseded; do not implement it. |

## What the software does on your machine

These are promises a report can hold us to. The detail is in
[plugins/random-knights/README.md](plugins/random-knights/README.md) under
"Network and privacy".

- **No network call unless you connect.** Nothing leaves your computer unless
  you run `aieds connect` (your own reports) or `aieds contribute on`
  (community totals). Each has its own consent and its own token file, and
  each is off by default. `AIEDS_SYNC=off` and `AIEDS_CONTRIBUTE=off` block
  them.
- **One exception you ask for.** `aieds ollama` talks to the Ollama server you
  name, by default the one on your own machine.
- **No telemetry.** Nothing is sent to Random Knights or anyone else by
  default.
- **Numbers only.** Prompt and response text are never stored, printed, logged
  or sent. After you connect, only an allowlisted set of numbers and names is
  sent per response, and the README lists every field.
- **A kill switch.** `AIEDS_RECEIPTS=off` turns the receipts off.

Anything that breaks one of these promises is a vulnerability. Report it the
same way.

## How releases are built

The npm packages are published from GitHub Actions with npm trusted
publishing (OIDC) and provenance, so a package can be traced to the commit
and workflow that built it. No long-lived npm token is stored in this
repository.

# Random Knights AiEDs plugin for Claude Code

After every Claude Code response, this plugin prints an AiEDs receipt: the
modeled energy (Wh), carbon (gCO2e) and Tree-Time (minutes) of that response and
of the session so far. The figures are computed on your machine from the
session's real token usage, with the AiEDs reference library, so they agree with
the standard to the number.

AiEDs is the AI Energy Disclosure Standard, published by Random Knights at
<https://standard.rand0m.ai>. This plugin lives in the same repository as the
standard, in `plugins/random-knights`.

## Install

In a Claude Code session:

```text
/plugin marketplace add Random-Knights/Standard
/plugin install random-knights@standard
```

Or from a shell:

```bash
claude plugin marketplace add Random-Knights/Standard
claude plugin install random-knights@standard
```

Node.js 20 or newer must be on your PATH. Claude Code does not ship Node, and the
hook is a small Node script with no dependencies.

## What you will see

After each response, one line:

```text
AiEDs receipt: 0.4412 Wh, 0.1893 gCO2e, 4.7 min tree-time (this response). Session: 12.3456 Wh, 5.2961 gCO2e, 2.1 hrs tree-time (37 model calls). Tokens this response: 52,310 in (48,200 cache read, 3,100 cache write), 1,204 out. Basis: AiEDs v2, claude-sonnet-4-5, class estimate, low confidence. Energy and carbon are modeled estimates. Tree-Time and equivalents are educational comparisons.
```

The numbers above are an illustration of the format, not a measurement.

Two commands show more, on demand:

| Command | What it prints |
| ------- | -------------- |
| `/random-knights:aieds` | The session total so far, with the token split. `/aieds` also works when no other command has that name. |
| `/random-knights:aieds-explain` | The formulas, the constants and the source of every coefficient, read from the bundled library. |

## What is measured

Tokens only. For each model call in the session transcript the plugin reads the
model name, the message id and four counters: input, cache write, cache read and
output tokens. It never reads a prompt or a response into a figure, never stores
one and never prints one.

How the figures are built (AiEDs methodology section 2.4):

```text
energyWh = inTok/1000 * whPer1kIn + outTok/1000 * whPer1kOut
energyWh = energyWh * pue
gCO2e    = energyWh/1000 * 429
treeTimeMinutes = gCO2e / 21000 * 525600
```

Cache-write and cache-read tokens are input, and they are charged at the full
input rate (methodology section 2.4.1). That is a stated conservative bias, not a
measurement: a cache read almost certainly costs less than recomputing the
prefill it replaces, and no provider publishes the ratio. Claude Code sessions
carry a large cached context, so the figures run high for that reason, in a
known direction.

For models in the coefficient table the receipt uses that model's coefficient.
Claude models carry a class estimate, because no per-query figure is published
by the model's vendor. A model that is not in the table gets the frontier-class
estimate and the receipt says so. Confidence is always low: a token count is a
proxy for energy, not a measurement of it.

## Privacy

- No network access. The plugin makes no request of any kind.
- No telemetry. Nothing is sent to Random Knights or anyone else.
- No files are written. The one exception is a local log that you turn on
  yourself (below).
- Prompt and response text are never stored, printed or logged.
- The scripts are in this directory and are short enough to read.

## Turn receipts off

Set one environment variable in your Claude Code settings
(`~/.claude/settings.json`, or a project's `.claude/settings.json`):

```json
{ "env": { "AIEDS_RECEIPTS": "off" } }
```

Remove the line, or set it to `on`, to turn receipts back on. Any of `off`, `0`,
`false`, `no` or `disabled` turns them off.

To disable the plugin entirely: `claude plugin disable random-knights`.

## Optional local log

Set `AIEDS_RECEIPT_LOG` to a file path and the hook appends one JSON line of
numbers per response (session id, model names, token totals, energy, carbon,
Tree-Time, provenance). It is off unless you set it. It never contains text.

```json
{ "env": { "AIEDS_RECEIPT_LOG": "/path/you/choose/aieds-receipts.jsonl" } }
```

## Uninstall

```bash
claude plugin uninstall random-knights@standard
claude plugin marketplace remove standard
```

## Behavior you can rely on

- The hook never blocks and never crashes Claude Code. On any error (an
  unreadable transcript, a malformed line, a missing file) it exits with code 0
  and prints nothing.
- The hook reads the final assistant message at Stop time. Claude Code's
  transcript can lag the live conversation, so the hook waits up to two seconds
  for the last message to appear and then uses what is there.
- Usage recorded in subagent transcript files kept outside the session file is
  not counted. Whatever the session transcript itself records is.

## How the library gets here

Claude Code installs a plugin by copying its directory, so this plugin cannot
import `lib/` from the repository. It carries a copy of the two compiled library
files and the factor table under `vendor/`, in the layout the library expects.
`scripts/sync-claude-plugin.mjs` at the repository root is the only writer of
that copy, and CI fails if the copy is not byte-identical to a fresh build of
`lib/`. Nothing in the plugin restates a coefficient.

## Other tools

This plugin is for Claude Code only, and it has been tested only there. Other
coding agents have their own hook and plugin mechanisms, but their transcript
formats and hook inputs differ from Claude Code's, so this plugin makes no claim
about them. To use the same numbers elsewhere today, call the reference library
(`@randomknights/aieds`) with the token counts your tool reports.

## Develop and test

```bash
cd lib && npm install && npm run build       # the library
node scripts/sync-claude-plugin.mjs          # refresh vendor/ after a lib change
cd plugins/random-knights && npm test
claude plugin validate ./plugins/random-knights
claude plugin validate .                     # the marketplace
```

To try an unreleased checkout without touching your settings:

```bash
claude --plugin-dir ./plugins/random-knights
```

Bump `version` in `.claude-plugin/plugin.json` and `package.json` together when
the plugin changes, or installed copies will not update.

## License

Code: Apache 2.0. The factor table is CC BY 4.0. See `LICENSE`, `LICENSE-DOCS`
and `NOTICE`.

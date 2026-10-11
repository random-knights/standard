# Random Knights AiEDs plugin

After every Claude Code response, this plugin prints an AiEDs receipt: the
modeled energy (Wh), carbon (gCO2e) and Tree-Time (minutes) of that response and
of the session so far. The figures are computed on your machine from the
session's real token usage, with the AiEDs reference library, so they agree with
the standard to the number.

## Which tools it works with

Status means one thing: the whole path was run on a real session of that tool,
and the receipt's token counts matched the tool's own reported usage. A row that
is not verified says what was and was not observed. Nothing here is claimed for
a tool that was not run.

| Tool | Status | Tested version | Install |
| ---- | ------ | -------------- | ------- |
| Claude Code | Verified | 2.1.286 | `/plugin marketplace add Random-Knights/Standard` then `/plugin install random-knights@standard` |
| Codex CLI | Verified in a live session, with one step left to you (see [Codex CLI](#codex-cli)) | 0.159.2 | `codex plugin marketplace add Random-Knights/Standard`, `codex plugin add random-knights@standard`, then trust the hook once with `/hooks` |
| Gemini CLI, Antigravity CLI | No verified path (see [Gemini CLI and Antigravity CLI](#gemini-cli-and-antigravity-cli)) | not run | none shipped |
| Ollama | Wrapper, not a plugin install; verified on a real local run (see [Ollama and Hugging Face](#ollama-and-hugging-face)) | 0.34.4 | `node scripts/aieds.mjs ollama --model <name> "<prompt>"` |
| Hugging Face | Library and wrapper, not a plugin install; not run against a Hugging Face endpoint | huggingface_hub 1.29.0 (client only) | `node scripts/aieds.mjs chat-completion <response.json> --provider "Hugging Face"` |
| Grok Build | Not verified (see [Grok Build](#grok-build)) | 1.0.13 | `grok plugin marketplace add Random-Knights/Standard` then `grok plugin install random-knights@Standard --trust` |

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

## Codex CLI

Status: **verified in a live session; the first run asks you to trust the hook.**
Tested version: Codex CLI 0.159.2. Codex's rollout file is documented by OpenAI
as "not a stable interface for hooks and may change over time", so the reader is
pinned to this version and prints nothing, rather than guesses, when a record
is not in the shape it knows.

Install, from a shell:

```bash
codex plugin marketplace add Random-Knights/Standard
codex plugin add random-knights@standard
```

Then start Codex and run `/hooks` once to review and trust the plugin's Stop
hook. Codex's documentation says it does not run a hook it has not been told to
trust, and that trust is tied to the hook's content hash, so an updated plugin
asks again. For one
non-interactive run you vouch for yourself, `codex exec --dangerously-bypass-hook-trust`
skips the review.

What is measured: each `token_count` record in the rollout
(`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`). Codex's `input_tokens` already
includes its `cached_input_tokens`, and `output_tokens` already includes
reasoning tokens. Codex's own "tokens used" line is input minus cached plus
output, so a receipt that says `15,733 in (12,288 cache read), 5 out` goes with
Codex's `tokens used 3,450`. The receipt counts cached input at the full input
rate (methodology section 2.4.1); Codex's line does not.

Observed:

- Both commands above install the plugin from this repository's marketplace
  file; `.codex-plugin/plugin.json` points Codex at `hooks/codex-hooks.json`.
  Codex reads a hook as one command string, which is why the Codex hook file is
  separate from the Claude Code one.
- Codex lists the installed plugin's hook as source `plugin`, event `stop`,
  trust status `untrusted` until you trust it.
- In a real `codex exec` session (the hook script run from the installed plugin
  copy with the hook trust check bypassed for that one run), the hook ran,
  Codex reported `Stop Completed`, and the receipt's token counts equaled the
  `usage` in Codex's own `turn.completed` event (18,467 in, 7,936 cached, 5 out).
  The energy equaled the library's result for those tokens.

Not observed: how the Codex terminal UI renders the `systemMessage` warning the
hook returns. Codex's documentation says it is shown as a warning in the UI or
event stream, and `codex exec` does not print it. The same plugin was not
installed into a signed-in Codex home, because that changes the signed-in
configuration; the live run above used a session-level hook override pointing
at the file the installer copied.

## Grok Build

Status: **not verified.** Tested version: Grok Build 1.0.13. The plugin
installs through Grok's own commands and its session files are read correctly,
but an automatic receipt after each response was not observed. What was and was
not seen:

Observed and working:

- `grok plugin marketplace add Random-Knights/Standard` and
  `grok plugin install random-knights@Standard --trust` install the plugin from
  this repository. `grok plugin validate plugins/random-knights` accepts the
  manifest, and `grok inspect` lists the plugin, its two skills and its hook.
- Grok writes each finished prompt's token usage to its session file
  (`updates.jsonl`, one `turn_completed` record with `inputTokens`,
  `cachedReadTokens`, `cacheCreationTokens`, `outputTokens` and a per-model
  split). The reader in this plugin turns that record into a receipt that matches
  the usage Grok itself reports for the same run (234 plain + 1,000 cache read
  input, 7 output), and the energy equals the library's result for those tokens.
- You can ask for that receipt on demand, for any Grok session:

  ```bash
  node scripts/aieds.mjs receipt --transcript "<grok home>/sessions/<encoded folder>/<session id>/updates.jsonl"
  node scripts/aieds.mjs receipt --session <session id>
  ```

  `<grok home>` is `~/.grok`, or `GROK_HOME` if you set it.

Observed and NOT working, so no automatic receipt is claimed:

- In headless (`grok -p`) and agent (`grok agent ... stdio`) sessions, Grok 1.0.13
  discovered the plugin's hook but never ran it, even with the plugin enabled and
  trusted. Hooks configured directly in Grok's `config.toml` did run. The
  interactive terminal UI was not driven in this test.
- For a response that ends normally, Grok writes that response's
  `turn_completed` record after its Stop hooks have returned. A Stop hook can
  read every earlier response and not the one it belongs to. The hook in this
  plugin checks for its own prompt id and prints nothing when the record is not
  there, rather than print the previous response's figures as "this response".
- These results were obtained against a local OpenAI-compatible model endpoint,
  not an xAI-hosted model, because that is what could be run without a current
  Grok sign-in. The session-file shape was not compared against an xAI-hosted
  session.

When Grok changes either behavior, the hook starts printing receipts without a
code change, and the tests in `test/grok.test.mjs` pin the shapes it relies on.

## Gemini CLI and Antigravity CLI

Status: **no verified path. Nothing is shipped for these tools.** The CLI was not
installed or run, so there is no tested version. What the vendor's own
documentation says, as of this writing:

- Google announced on 2026-05-19 that Gemini CLI is being replaced by the
  Antigravity CLI (command `agy`). Gemini CLI stopped serving requests on
  2026-06-18 for Google AI Pro and Ultra subscribers and for free users of Gemini
  Code Assist for individuals. It remains available with Gemini Code Assist
  Standard or Enterprise licenses and with paid Gemini API keys.
- Antigravity CLI installs with Google's own installer (a PowerShell or shell
  script, not a package-manager package) and requires a Google sign-in before it
  does anything. It also offers a Gemini API key path for headless use.
- Antigravity hooks and plugins exist. A hook receives `conversationId`,
  `transcriptPath` and `modelName`. Google's hooks page documents no token usage
  or usage metadata for any hook event and no `systemMessage` output field.

Without a documented usage field there is nothing for a receipt to be computed
from except a transcript whose format was not examined, and a sign-in was
required before any session could run. So no reader, manifest or install command
is claimed here. If Google publishes token usage to hooks, or a signed-in
session's transcript is examined and found to carry it, a reader can be added in
the same shape as the Codex and Grok ones.

## Ollama and Hugging Face

Neither has a hook or plugin mechanism, so there is nothing to install into.
What they have is a chat response that carries its own token counts, and three
small commands in `scripts/aieds.mjs` turn those counts into the same receipt.
These are wrappers around the same library, not a plugin install. They need
Node.js 20 or newer and nothing else, and none of them stores or logs a prompt
or a response.

From a clone of this repository (or the installed plugin directory):

```bash
# Ollama: one chat call, then the reply and its receipt.
node plugins/random-knights/scripts/aieds.mjs ollama --model llama3.2:1b "Say hello"

# Any OpenAI-compatible chat completion saved as JSON (Hugging Face Inference
# Providers, Ollama's /v1 endpoint, and others), or piped on stdin with "-".
node plugins/random-knights/scripts/aieds.mjs chat-completion response.json --provider "Hugging Face"

# Raw counts from anywhere.
node plugins/random-knights/scripts/aieds.mjs usage --provider "Hugging Face" --model <model id> --input 1200 --output 300 --cached 800
```

`ollama` accepts `--host <url>` (default: `OLLAMA_HOST`, then
`http://127.0.0.1:11434`), `--num-ctx <n>` to pass a context size through, and
`--no-text` to print only the receipt. The one network request it makes goes to
that host and nowhere else. It reads `prompt_eval_count` (the whole prompt),
`prompt_eval_cached_count` (the part of it reused from the cache, shown as cache
read) and `eval_count` (the output).

Observed:

- Against a real local Ollama 0.34.4 and `llama3.2:1b`, the wrapper's receipt
  carried the counts Ollama returned (51 in with 50 cached, 107 out) and its
  energy equaled the library's result for those tokens. Ollama's
  `prompt_eval_count` stayed the whole prompt on a repeated call while the
  cached count rose, which is why the cached count is treated as a part of the
  input and not an addition to it.
- `chat-completion` was run on a real response from Ollama's OpenAI-compatible
  endpoint, which has the same `usage` block a Hugging Face chat completion has.

Not observed: a response from Hugging Face itself. The Hugging Face account used
for testing had no Inference Providers credits (HTTP 402), so no call was made
that returned a Hugging Face `usage` block. The `usage` fields read here
(`prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`)
are the documented OpenAI-compatible ones, but treat the Hugging Face row as
unverified until you run it once with your own credits.

A local model has no per-model coefficient in the table, so the receipt uses the
frontier-class estimate and says so. That figure is an order-of-magnitude
estimate for a data-center model and says nothing about your own hardware.

## Other tools

Claude Code, Codex CLI, Grok Build, Gemini/Antigravity, Ollama and Hugging Face are covered above. Other coding agents have their
own hook and plugin mechanisms, and their transcript formats and hook inputs
differ, so this plugin makes no claim about a tool that is not in the table. To
use the same numbers elsewhere today, call the reference library
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

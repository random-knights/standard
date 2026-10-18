---
name: aieds
description: Show the AiEDs energy, carbon, tree-time and water receipt for this Claude Code session so far.
disable-model-invocation: true
allowed-tools: 'Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs" *)'
---

Print the receipt below exactly as written, with no commentary, no extra
formatting and no additions. It was computed locally from this session's token
usage.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs" receipt --session "${CLAUDE_SESSION_ID}"`

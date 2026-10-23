---
name: aieds-explain
description: Explain how the AiEDs receipt is computed: the formulas, the constants, the source of every coefficient, and this session's receipt unrounded with the water range.
disable-model-invocation: true
allowed-tools: 'Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs" *)'
---

Print the explanation below exactly as written, with no commentary, no extra
formatting and no additions. It is generated from the AiEDs reference library
bundled with this plugin.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs" explain --session "${CLAUDE_SESSION_ID}"`

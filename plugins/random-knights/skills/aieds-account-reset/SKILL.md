---
name: aieds-account-reset
description: Start your AiEDs account total on this computer again from zero.
disable-model-invocation: true
allowed-tools: 'Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs" *)'
---

Print the result below exactly as written, with no commentary, no extra
formatting and no additions.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs" account reset`

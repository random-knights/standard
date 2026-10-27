---
name: aieds-account
description: Show your AiEDs account total kept on this computer, with phone-charge and driving comparisons.
disable-model-invocation: true
allowed-tools: 'Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs" *)'
---

Print the total below exactly as written, with no commentary, no extra
formatting and no additions. It is read from a file on this computer and is
never sent anywhere.

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/aieds.mjs" account`

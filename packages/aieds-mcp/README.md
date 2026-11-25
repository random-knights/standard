# @randomknights/aieds-mcp

An MCP server for the [AI Energy Disclosure Standard (AiEDs)](https://standard.rand0m.ai), methodology 2.5.1. It gives an agent three tools over stdio. It needs no key and makes no network call.

The package version is the methodology version it implements. The coefficients are the published AiEDs factor table, shipped inside the package, not a second copy.

## Add it to an MCP client

Most clients take a block like this (for example Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "aieds": {
      "command": "npx",
      "args": ["-y", "@randomknights/aieds-mcp"]
    }
  }
}
```

In Claude Code:

```bash
claude mcp add aieds -- npx -y @randomknights/aieds-mcp
```

Node.js 20 or newer is needed.

## Tools

- **`aieds_estimate`**: compute metrics in (`gpuSeconds` with a hardware key, or `flops`, or `tokens` with a model scale), energy in kWh and carbon in gCO2e out, with the confidence the input path earns and the grid intensity used. For inference it adds a modeled water estimate with a low to high range.
- **`aieds_factors`**: the factor tables the estimate uses: hardware power draw, grid carbon intensity by region, token energy proxies and the J/TFLOP constant.
- **`aieds_disclose`**: checks a disclosure record against the AiEDs JSON Schema (draft 2020-12) and returns `{ conforms, errors, methodologyBadge }`.

AiEDs disclosures are self-attested. `aieds_disclose` checks schema conformance only; it does not re-derive the energy figures.

## What this server is not

It is not a receipt source. An MCP server never sees the host conversation's token usage, so it cannot print a receipt for a Claude Code, Codex, Grok Build or Copilot CLI response. Those come from the `aieds` command in [@randomknights/aieds](https://www.npmjs.com/package/@randomknights/aieds) and the Random Knights plugin.

## Links

- Methodology and schema: https://standard.rand0m.ai
- Source: https://github.com/random-knights/standard/tree/main/mcp
- Report a vulnerability: https://github.com/random-knights/standard/security

## License

The code and the schema are Apache-2.0. The coefficient tables in `spec/v2/aieds-factors.json` are CC BY 4.0. The NOTICE file says which part each license covers.

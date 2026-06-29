# AIEDS — AI Energy Disclosure Standard

**AI Energy Disclosure Standard (AIEDS)** is an open schema and toolset for self-attested energy and carbon footprint disclosures for AI models, agents, and apps.

AIEDS v1 surfaces:
- **`/spec`** — the JSON Schema (`aieds.schema.json`) + methodology (`methodology.md`) + conformance examples.
- **`/mcp`** — a keyless MCP server (TypeScript/Node) exposing three tools: `aieds_estimate`, `aieds_factors`, `aieds_disclose`.

> **AIEDS scope is device / usage / inference / training.**
> It is NOT the planetary Earth Health Score produced by `rand0m.ai/earthHealthScoreRefresh`. See [spec/methodology.md §1](spec/methodology.md#1-scope-and-non-overlap).

## Quick start

```bash
# Validate the bundled examples against the schema:
cd spec && npm install && node examples/validate.mjs

# Build and test the MCP server:
cd mcp && npm install && npm run build && npm test

# Wire the MCP server into your agent (stdio):
node mcp/dist/index.js
```

## What AIEDS is

Energy and carbon transparency for AI is fragmented: model cards use ad-hoc fields, EU AI Act compliance requires documented energy figures, and agent frameworks have no standard way to surface per-session footprint.

AIEDS provides:

1. **A schema** (`aieds.schema.json`, JSON Schema draft 2020-12) that is field-compatible with Hugging Face `co2_eq_emissions` and the EU AI Act model-documentation form — so a single disclosure is legible to both.
2. **A methodology** (`methodology.md`) with versioned factor tables (hardware TDP, grid intensity, token proxies) and a governance rule: no silent drift (owner-ratified changes, CHANGELOG).
3. **An MCP server** that any agent can wire in to get `aieds_estimate` / `aieds_factors` / `aieds_disclose` over stdio — keyless, deterministic, zero network calls.

## Architecture (ADR 0010)

AIEDS is specified in ADR 0010 (random-knights/readless CODEX). The key design choices:

- **Self-attestation** — producers derive and sign their own disclosures; consumers verify schema conformance. No registry or central authority in v1.
- **Methodology versioning** — `methodologyVersion` in every disclosure ties the number to a specific factor table snapshot. An auditor can replay the math.
- **Agent-native** — the MCP tool interface means an agent can disclose its own session footprint inline, not as a post-hoc batch job.
- **Keyless** — the schema and MCP server require no API keys, no auth, no secrets.

## v1 surfaces

| Surface | Path | License | Description |
|---------|------|---------|-------------|
| Schema | `spec/aieds.schema.json` | MIT | JSON Schema 2020-12 for one disclosure |
| Methodology | `spec/methodology.md` | CC BY 4.0 | Compute→energy→CO₂e path + factor tables |
| Examples | `spec/examples/` | CC BY 4.0 | 3 valid disclosures + conformance script |
| MCP server | `mcp/` | MIT | TypeScript Node MCP: estimate / factors / disclose |

## Roadmap

### v1.0 (this repo — owner-gated publish)
- [x] `aieds.schema.json` (JSON Schema draft 2020-12)
- [x] `methodology.md` v1.0.0 with factor tables + governance
- [x] 3 conformance examples + validate script
- [x] MCP server: `aieds_estimate`, `aieds_factors`, `aieds_disclose`
- [x] CI: schema validation + build + unit tests

### v1.1 (deferred)
- [ ] Read API / SDK for ingesting disclosures from external producers
- [ ] `.well-known/aieds.json` auto-discovery endpoint
- [ ] npm publish `@random-knights/aieds-mcp`
- [ ] Scope 3 embodied carbon (hardware manufacture)
- [ ] Real-time grid intensity (carbon-aware scheduling)

## License

- `spec/methodology.md` and `spec/examples/` — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- `spec/aieds.schema.json` and `mcp/` — [MIT](LICENSE#mit-license)

See [LICENSE](LICENSE) for full terms.

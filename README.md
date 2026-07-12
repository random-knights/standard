# AIEDS — AI Energy Disclosure Standard

> **CURRENT VERSION: methodology 2.0.0 (MCP server 2.0.0). Versions 1.x are
> SUPERSEDED and MUST NOT be implemented.** 1.x specified a flat 0.30 gCO2e per
> 1k tokens for every model and derived energy backward from carbon. Both are
> wrong. If you are new here, implement 2.0.0; do not pick up 1.0.0 because it
> sounds like the stable base. See `spec/methodology.md`.

**AI Energy Disclosure Standard (AIEDS)** is an open schema and toolset for self-attested energy and carbon footprint disclosures for AI models, agents, and apps.

AIEDS surfaces:
- **`/spec`** — the JSON Schema (`aieds.schema.json`) + methodology (`methodology.md`) + conformance examples.
- **`/lib`** — the reference library (TypeScript/Node): tokens/model/carbon in → full AIEDS disclosure out, byte-mirroring the rand0m.ai app so app and standard agree to the number.
- **`/mcp`** — a keyless MCP server (TypeScript/Node) exposing three tools: `aieds_estimate`, `aieds_factors`, `aieds_disclose`.

**Metric hierarchy** (methodology §1.1): Level 1 modeled scientific estimates (energy, CO₂e) → Level 2 operational metrics (tokens, cost, latency) → Level 3 human equivalencies (Tree-Time, phone charges, …; educational only, never offsets).

> **AIEDS scope is device / usage / inference / training.**
> It is NOT the planetary Earth Health Score produced by `rand0m.ai/earthHealthScoreRefresh`. See [spec/methodology.md §1](spec/methodology.md#1-scope-and-non-overlap).

## Quick start (one minute)

Disclose your first response with the reference library:

```bash
cd lib && npm install && npm run build
node examples/request-to-disclosure.mjs   # request in → disclosure out
```

Or in your own code:

```js
import { disclosureFromResponse } from "@random-knights/aieds-reference";

const d = disclosureFromResponse({
  provider: "GoogleAI", model: "gemini-2.0-flash",
  inputTokens: 412, outputTokens: 890,
  costUsd: 0.0031, carbonGrams: 0.62,
});
// d.energyWh, d.carbonGrams, d.treeTimeLabel ("14.8 min"), d.notes (required copy)
```

The rest of the toolset:

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
| Reference library | `lib/` | MIT | Carbon-first disclosures (mirrors the rand0m.ai app; parity-tested) |
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
- `spec/aieds.schema.json`, `lib/`, and `mcp/` — [MIT](LICENSE#mit-license)

See [LICENSE](LICENSE) for full terms.

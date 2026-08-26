# aieds-mcp

MCP server for the [AI Energy Disclosure Standard (AIEDS) v1](../spec/methodology.md).
Exposes three tools any agent or provider can wire in over stdio - keyless, no secrets, no network.

## Tools

### `aieds_estimate`

Deterministic energy + CO2e estimate from compute metrics.

```json
{
  "subject": { "kind": "model", "name": "my-model", "version": "1.0" },
  "compute": { "gpuSeconds": 3600, "hardware": "NVIDIA H100 SXM" },
  "gridRegion": "EU27"
}
```

Returns `{ energyKWh, gCO2e, confidence, methodologyVersion, gridIntensity, notes }`.

Confidence path:
- `gpuSeconds + hardware in table` -> **med**
- `gpuSeconds + unknown hardware` or `tokens` or `flops` -> **low**
- Direct power measurement (not emitted by this tool) -> **high**

### `aieds_factors`

Returns the full AIEDS v1 factor tables (hardware TDP, grid intensities, token proxies).
Use this to inspect what the server uses, or to build disclosures manually.

### `aieds_disclose`

Validates a disclosure object against `spec/aieds.schema.json` (JSON Schema draft 2020-12).

```json
{ "disclosure": { ...your disclosure... } }
```

Returns `{ conforms: bool, errors: [...], methodologyBadge: "AIEDS v1.0.0, med confidence" | null }`.

AIEDS disclosures are **self-attested** - this tool checks schema conformance only. It does not re-derive or verify the energy math.

## Wiring (stdio)

In your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "aieds": {
      "command": "node",
      "args": ["/absolute/path/to/aieds/mcp/dist/index.js"]
    }
  }
}
```

Build first: `cd mcp && npm install && npm run build`.

For agents calling via the SDK directly, pass `args: ["dist/index.js"]` and set `cwd` to the `mcp/` directory.

## Dev setup

```bash
cd mcp
npm install
npm run build    # tsc -> dist/
npm test         # node:test unit tests
```

Tests cover: estimate determinism (gpuSeconds, tokens, flops, unknown hardware, unknown region), disclose accepts valid / rejects invalid disclosures, all three bundled spec examples pass.

## v1 trust model

AIEDS v1 is **schema-conformance self-attestation**:

1. A producer calls `aieds_estimate` to derive `energyKWh` and `gCO2e` from compute metrics.
2. The producer assembles a full disclosure and calls `aieds_disclose` to confirm it is schema-valid.
3. The disclosure (with `methodologyBadge`) is embedded in logs, model cards, or published as a GitHub Release asset.
4. Consumers verify schema conformance independently using the same `aieds_disclose` tool or any JSON Schema 2020-12 validator against `spec/aieds.schema.json`.

No server, no registry, no API key. The schema is the contract.

## v1.1 roadmap (deferred)

- Read API / SDK for ingesting disclosures from external producers
- `.well-known/aieds.json` auto-discovery endpoint
- npm publish `@random-knights/aieds-mcp`

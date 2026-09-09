<a name="readme-top"></a>

<!-- HEADER -->
<div align="center">
  <img alt="Random Knights standards: K13 and AiEDs" src="assets/readme-header.png?v=20260907">

<h3 align="center" style="color:#ff4124">Random Knights Standards</h3>

  <p align="center">
    Two open standards from Random Knights. K13 is how we write. AiEDs is how
    we report modeled energy and carbon from AI work.
    <br />
    <a href="https://randomknights.xyz"><strong>Read them on the docs site &raquo;</strong></a>
    <br />
    <br />
    <a href="https://randomknights.xyz/k13/">K13</a>
    &#183;
    <a href="https://randomknights.xyz/aieds/">AiEDs</a>
    &#183;
    <a href="https://standard.rand0m.ai">Artifacts</a>
    &#183;
    <a href="https://github.com/random-knights/standard/issues">Report Bug</a>
    &#183;
    <a href="https://github.com/random-knights/standard/issues">Request Feature</a>
    <br />
    <br />
    &#127979; 2025-2030 &#128760; roswell, ga &#127825;
    <a href="https://randomknights.xyz">&#7450;k.xyz</a> +
    <a href="https://randomknights.llc">&#7450;k.llc</a> +
    <a href="https://randomknights.org">&#7450;k.org</a> &#127984;
    <a href="https://rand0m.ai">rand0m.ai</a>
  </p>
</div>

Both are published and free to read. Both are CC BY 4.0, so you can adopt
either without asking. Both live in this repository.

| Standard | Version | License | Canonical text | Read it |
|---|---|---|---|---|
| **AiEDs - AI Energy Disclosure Standard** | methodology 2.0.0 | CC BY 4.0 prose and data, Apache 2.0 code and schema | [spec/methodology.md](spec/methodology.md) with `spec/`, `lib/`, `mcp/` | [standard.rand0m.ai](https://standard.rand0m.ai) |
| **K13 - AI Response Standard** | 1.1.0 | CC BY 4.0 | [K13.md](K13.md) | [randomknights.xyz/k13](https://randomknights.xyz/k13/) |

## K13 - AI Response Standard

Thirteen steps, run in order, every time. Every time does not mean every step
takes real work: on short replies the steps collapse to a second each and the
four passes come out identical. That is the standard being met, not skipped.

Steps 9 to 12 are one ladder. A reader picks a level and the answer is
**written at that level, never rewritten from another one.** All levels state
the same facts and the same figures. If two levels disagree on a number, the
answer is wrong.

| Level | Grades | Step |
|---|---|---|
| &#129475; juice box | K-5 | 9 |
| &#129380; soda pop | 6-8 | 10 |
| &#129483; energy drink | 9-12 | 11, default |
| &#9749; black coffee | College | 12 |

Two expert levels are RESERVED above black coffee: &#129750; `loose leaf`
(Masters) and &#129481; `yerba mate` (Doctorate). They are not reading levels,
they assume a different reader, so they carry no step number and do not change
the count.

Level three is named "energy drink" and carries the bubble tea glyph. That
mismatch is an intentional owner decision. Do not reconcile one to the other.

### Demo: one fact, written at every level

The same fact about the same feed on the same date. Only the sentences change.
This is the whole claim, so it is worth reading all four rather than one.

> **&#129475; juice box.** The ocean map is old. New data stopped arriving on
> 12 July. The map still draws. It is showing you an average of past years,
> not the water today.

> **&#129380; soda pop.** This map shows ocean currents, the paths that water
> moves along. The data behind it stopped updating on 12 July. Since then the
> map uses a climatology, which is an average worked out from many past years
> rather than a reading taken today. The map still draws, but what it shows is
> that average, not the water as it is now.

> **&#129483; energy drink.** The OSCAR ocean current feed has not refreshed
> since 12 July. With no new data, the renderer falls back to a climatology
> grid: a field of long-term average values for each point on the map,
> computed from years of past observations. The map still renders, and every
> value on it is one of those averages rather than a measurement taken since
> 12 July.

> **&#9749; black coffee.** The OSCAR near-real-time surface current product
> has not refreshed since 12 July. The renderer degrades to the representative
> climatology grid and marks freshness stale, so the field stays fully
> populated while every rendered vector is a climatological mean rather than a
> near-real-time observation. A consumer that treats the surface as current
> will read means as observations.

Every version says the feed stopped on 12 July and that the map now shows an
average. Same fact, same date, four readers.

The interactive version, including the two reserved levels, is at
[randomknights.xyz/k13/demo](https://randomknights.xyz/k13/demo/).
[Get started](https://randomknights.xyz/k13/get-started/) covers adopting it
in your own pipeline.

## AiEDs - AI Energy Disclosure Standard

An open schema and toolset for self-attested energy and carbon footprint
disclosures for AI models, agents, and apps.

AiEDs surfaces:
- **`/spec`** - the JSON Schema (`aieds.schema.json`) + methodology (`methodology.md`) + conformance examples.
- **`/lib`** - the reference library (TypeScript/Node): **tokens + model in; energy-first disclosure out** (energy modeled from per-model coefficients, carbon derived from energy), byte-mirroring the rand0m.ai app so app and standard agree to the number.
- **`/mcp`** - a keyless MCP server (TypeScript/Node) exposing three tools: `aieds_estimate`, `aieds_factors`, `aieds_disclose`.

> **CURRENT VERSION: methodology 2.0.0 (MCP server 2.0.1). Versions 1.x are
> SUPERSEDED and MUST NOT be implemented.** 1.x specified a flat 0.30 gCO2e per
> 1k tokens for every model and derived energy backward from carbon. Both are
> wrong. If you are new here, implement 2.0.0; do not pick up 1.0.0 because it
> sounds like the stable base. See `spec/methodology.md`.

**Metric hierarchy** (methodology section 1.1): Level 1 modeled scientific estimates (energy, CO2e) -> Level 2 operational metrics (tokens, cost, latency) -> Level 3 human equivalencies (Tree-Time, phone charges, ...; educational only, never offsets).

> **AiEDs scope is device / usage / inference / training.**
> It is NOT the planetary Earth Health Score produced by `rand0m.ai/earthHealthScoreRefresh`. See [spec/methodology.md section 1](spec/methodology.md#1-scope-and-non-overlap).

### Quick start (one minute)

Disclose your first response with the reference library:

```bash
cd lib && npm install && npm run build
node examples/request-to-disclosure.mjs   # request in -> disclosure out
```

Or in your own code (ENERGY-FIRST: pass tokens + model; energy is modeled from
the per-model coefficient and carbon is DERIVED from energy - you never pass
carbon in):

```js
import { disclosureFromResponse } from "@random-knights/aieds-reference";

const d = disclosureFromResponse({
  provider: "GoogleAI", model: "gemini-2.0-flash",
  inputTokens: 412, outputTokens: 890,
  costUsd: 0.0031,
});
// Real output (run examples/request-to-disclosure.mjs to reproduce):
//   d.energyWh      0.47664            modeled FIRST from gemini's coefficient
//   d.carbonGrams   0.20448            derived: energyWh / 1000 * 429
//                                      429 gCO2e/kWh is the pinned
//                                      response-surface grid intensity
//                                      (methodology 2.4). It is a project
//                                      modeled constant with no external
//                                      citation, labeled as such in
//                                      spec/v2/aieds-factors.json.
//   d.treeTimeLabel "5.1 min"
//   d.confidence    "vendor-published" per-model tier, never hidden
//   d.citation      "Google (Aug 2025) ... arxiv.org/abs/2508.15734 ..."
```

### Validating a record today

The schema is `spec/aieds.schema.json`, JSON Schema draft 2020-12, methodology
2.0.0.

Its `$id` is `https://standard.rand0m.ai/aieds/v2/aieds.schema.json`, and the
host serves the schema at that URL, byte-identical to `spec/aieds.schema.json`
(a test in `spec/` rebuilds the site tree and refuses a deploy where they
differ). A JSON Schema `$id` is an identifier, not a locator: a schema loaded
from a local file validates just as well, because nothing dereferences it.
Local file validation is the supported path.

So, to validate a record, load the file:

```bash
cd spec && npm install
node examples/validate.mjs          # the bundled fixtures
```

```js
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync("spec/aieds.schema.json", "utf-8")));

if (!validate(myRecord)) console.error(validate.errors);
```

A record stamping a 1.x `methodologyVersion` is REJECTED. Methodology 1.x is
superseded and must not be used for new disclosures, so a v2 schema that accepted
a v1 record would be certifying nonconformance. The `deprecated-v1-*.json`
fixtures exist to prove that rejection, not to be copied.

`provenance` is optional. It carries the section 5.1 ladder (measured,
vendor-published, class-estimated, unknown) and says where the FACTOR came from.
`confidence` is unchanged and carries the section 5 ladder, which says how the
ENERGY figure was arrived at. They are different ladders and neither implies the
other, which is why they are separate fields rather than one widened one.

The rest of the toolset:

```bash
# Validate the bundled examples against the schema:
cd spec && npm install && node examples/validate.mjs

# Build and test the MCP server:
cd mcp && npm install && npm run build && npm test

# Wire the MCP server into your agent (stdio):
node mcp/dist/index.js
```

## What AiEDs is

Energy and carbon transparency for AI is fragmented: model cards use ad-hoc fields, EU AI Act compliance requires documented energy figures, and agent frameworks have no standard way to surface per-session footprint.

AiEDs provides:

1. **A schema** (`aieds.schema.json`, JSON Schema draft 2020-12) that is field-compatible with Hugging Face `co2_eq_emissions` and the EU AI Act model-documentation form - so a single disclosure is legible to both.
2. **A methodology** (`methodology.md`) with versioned factor tables (hardware TDP, grid intensity, token proxies) and a governance rule: no silent drift (owner-ratified changes, CHANGELOG).
3. **An MCP server** that any agent can wire in to get `aieds_estimate` / `aieds_factors` / `aieds_disclose` over stdio - keyless, deterministic, zero network calls.

## Why 2.0.0 (energy-first) beats 1.x

1.x used a single flat constant - **0.30 gCO2e per 1k tokens for every model** - and derived energy backward from carbon. That is what 2.0.0 abolishes. The response-surface path (methodology 2.4, implemented in `/lib`) replaces it with:

- **Per-model energy coefficients, not one constant.** Each model class has its own `whPer1kIn` / `whPer1kOut` (output tokens cost ~4x input: decode is sequential, prefill is parallel). Gemini `0.12 / 0.48`, GPT/o* `0.17 / 0.68`, Claude `0.145 / 0.58` Wh per 1k tokens, plus a per-provider PUE.
- **Confidence tiers on every coefficient**, surfaced in the disclosure, never hidden:

  | tier | meaning |
  | --- | --- |
  | `measured` | we benchmarked it |
  | `vendor-published` | the provider published a figure (cited; split assumptions noted) |
  | `class-estimated` | inferred from model class; no provider figure exists |
  | `unknown` | nothing sourceable; frontier-class fallback, labeled `unknown` |

- **A sourced citation per coefficient** (the honesty contract: a number without provenance does not belong in the table). Gemini cites Google Aug 2025 (arXiv:2508.15734); GPT cites the OpenAI Jun 2025 blog figure; Claude states plainly it is a class estimate (no Anthropic figure as of 2026-01); an unlisted model returns the frontier-class fallback labeled `unknown` rather than a confident guess.

Concretely: the same 412-in / 890-out exchange that 1.x would have blurred into one flat number now discloses `0.47664 Wh` energy-first with a `vendor-published` tier and a citation for Gemini, versus `0.691128 Wh` labeled `unknown` for a model not in the table - the reader can see both the number and how much to trust it.

## Architecture (ADR 0010)

AiEDs is specified in an owner-ratified architecture decision record. The key design choices:

- **Self-attestation** - producers derive and sign their own disclosures; consumers verify schema conformance. No registry or central authority.
- **Methodology versioning** - `methodologyVersion` in every disclosure ties the number to a specific factor table snapshot. An auditor can replay the math.
- **Agent-native** - the MCP tool interface means an agent can disclose its own session footprint inline, not as a post-hoc batch job.
- **Keyless** - the schema and MCP server require no API keys, no auth, no secrets.

## Surfaces

| Surface | Path | License | Description |
|---------|------|---------|-------------|
| Schema | `spec/aieds.schema.json` | Apache 2.0 | JSON Schema 2020-12 for one disclosure |
| Methodology | `spec/methodology.md` | CC BY 4.0 | 2.0.0: energy-first path + per-model coefficients + factor tables |
| Coefficient tables | `spec/v2/aieds-factors.json` | CC BY 4.0 | The published factor data every surface reads |
| Examples | `spec/examples/` | CC BY 4.0 | 4 valid disclosures, 3 superseded-1.x records the schema must reject, and a conformance script |
| Reference library | `lib/` | Apache 2.0 | Energy-first disclosures: per-model coefficients + confidence tiers + citations (mirrors the rand0m.ai app; contract-tested) |
| MCP server | `mcp/` | Apache 2.0 | TypeScript Node MCP: estimate / factors / disclose |
| K13 | `K13.md` | CC BY 4.0 | K13 - AI Response Standard, 1.1.0. The canonical text. |

## Roadmap

### Shipped (this repo)
- [x] `aieds.schema.json` (JSON Schema draft 2020-12)
- [x] `methodology.md` 2.0.0 (energy-first; per-model coefficients + confidence tiers + citations) with factor tables + governance
- [x] 7 conformance examples (4 valid, 3 superseded-1.x rejection cases) + validate script
- [x] MCP server 2.0.0: `aieds_estimate`, `aieds_factors`, `aieds_disclose`
- [x] Reference library 2.0.0: energy-first, byte-mirrors the app
- [x] CI: schema validation + build + unit tests

### Deferred
- [ ] Read API / SDK for ingesting disclosures from external producers
- [ ] `.well-known/aieds.json` auto-discovery endpoint
- [ ] npm publish `@random-knights/aieds-mcp`
- [ ] Scope 3 embodied carbon (hardware manufacture)
- [ ] Real-time grid intensity (carbon-aware scheduling)

## Operating this repo

- [RUNBOOK.md](RUNBOOK.md) - humans: how to publish, roll back, where secrets
  live, what breaks and how to fix it.
- [CONTRIBUTING.md](CONTRIBUTING.md) - contributors and agents: what belongs
  where, versioning and governance, the keyless rule.

## Cite

Cite the version you implemented or adopted. AiEDs versions are not
interchangeable: 1.x derived energy backward from carbon and 2.0.0 models
energy first, so a citation without a version does not say which numbers were
used.

> Random Knights, LLC (2026). AiEDs - AI Energy Disclosure Standard,
> version 2.0.0. CC BY 4.0. https://standard.rand0m.ai

> Random Knights, LLC (2026). K13 - AI Response Standard, version 1.1.0.
> CC BY 4.0. https://github.com/random-knights/standard

**Author:** Random Knights, LLC, ORCID https://orcid.org/0009-0006-5066-1693

Machine-readable metadata: [CITATION.cff](CITATION.cff) describes AiEDs and
is the file GitHub reads to offer APA and BibTeX exports from the sidebar;
[CITATION.k13.cff](CITATION.k13.cff) describes K13 in the same format.

## License

Two licenses, split by what a path IS, not by which directory it sits in.
Code and the schema (so implementers can vendor them without attribution
friction) are Apache 2.0. Text and data that document or parameterize the
standard (so attribution survives forks and citation stays intact) are
CC BY 4.0.

| Path | License |
|------|---------|
| `lib/` | [Apache 2.0](LICENSE) |
| `mcp/` | [Apache 2.0](LICENSE) |
| `spec/aieds.schema.json` | [Apache 2.0](LICENSE) |
| `spec/methodology.md` | [CC BY 4.0](LICENSE-DOCS) |
| `spec/examples/` | [CC BY 4.0](LICENSE-DOCS) |
| `spec/v2/aieds-factors.json` | [CC BY 4.0](LICENSE-DOCS) |
| `K13.md` | [CC BY 4.0](LICENSE-DOCS) |

See [LICENSE](LICENSE) and [LICENSE-DOCS](LICENSE-DOCS) for full terms.

# @randomknights/aieds

AiEDs, the AI Energy Disclosure Standard, version 2.3.0, as an npm package.

It carries three things, each built from its one canonical file in
[random-knights/standard](https://github.com/random-knights/standard):

| What | Import | Source in the repository |
| --- | --- | --- |
| The reference library: tokens and a model in, an energy-first disclosure out | `@randomknights/aieds` | `lib/` |
| The JSON Schema for one disclosure record (JSON Schema 2020-12) | `@randomknights/aieds/schema.json` | `spec/aieds.schema.json` |
| The published coefficient tables every AiEDs surface reads | `@randomknights/aieds/factors.json` | `spec/v2/aieds-factors.json` |

The normative text is the methodology at
<https://standard.rand0m.ai>. This package implements it; it does not
replace it.

## Install

```
npm install @randomknights/aieds
```

Node 20 or newer. ES modules only. TypeScript types are included. No runtime
dependencies, no network calls, no keys.

## Example

```js
import {
  disclosureFromResponse,
  schemaRecordFromDisclosure,
} from "@randomknights/aieds";

const disclosure = disclosureFromResponse({
  provider: "GoogleAI",
  model: "gemini-2.0-flash",
  inputTokens: 412,
  outputTokens: 890,
});

console.log(disclosure.energyWh);    // 0.47663999999999995
console.log(disclosure.carbonGrams); // 0.20447855999999998
console.log(disclosure.provenance);  // "vendor-published"
console.log(disclosure.citation);    // the source of the coefficient

// The subset the published schema validates.
const record = schemaRecordFromDisclosure(disclosure, {
  id: "aieds:example:inference:001",
  subject: { kind: "model", name: "gemini-2.0-flash" },
  scope: "inference",
  window: "PT1S",
  source: "@randomknights/aieds",
});
```

Energy is modeled first from the per-model coefficient table; carbon is
derived from energy. A model that is not in the table gets the `unknown`
provenance rung and says so; it is never given a borrowed number.

To validate a record, load the schema and use any JSON Schema 2020-12
validator:

```js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const schema = require("@randomknights/aieds/schema.json");
```

The library does not bundle a validator.

## Versions

The package version is the AiEDs methodology version it implements. The
methodology version the library read from its bundled table is exported as
`METHODOLOGY_VERSION`.

## License

Two licenses, see `NOTICE`:

- The library code (`lib/`) and the JSON Schema (`spec/aieds.schema.json`):
  Apache 2.0, in `LICENSE`.
- The coefficient tables (`spec/v2/aieds-factors.json`): CC BY 4.0, in
  `LICENSE-DOCS`. Attribute "Random Knights, LLC, AiEDs" with the version and
  a link to <https://standard.rand0m.ai>.

SPDX: `Apache-2.0 AND CC-BY-4.0`.

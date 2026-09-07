import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  HARDWARE_FACTORS,
  GRID_FACTORS,
  TOKENS_WH_PER_MILLION,
  JOULES_PER_TFLOP,
  METHODOLOGY_VERSION,
} from "./factors.js";
import { estimate, type EstimateInput } from "./estimate.js";

// Load and compile the canonical schema at startup - validates on every aieds_disclose call.
const schemaPath = new URL("../../spec/aieds.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv2020({ strict: false });
// ajv-formats v3 is CJS; NodeNext treats the default as module.exports - cast required.
(addFormats as unknown as (a: Ajv2020) => void)(ajv);
const validateDisclosure = ajv.compile(schema);

const server = new Server(
  { name: "aieds", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "aieds_estimate",
      description:
        "Estimate energy consumption (kWh) and CO2e emissions (gCO2e) for an AI subject " +
        "from compute metrics. Returns a deterministic result from AiEDs v1 factor tables. " +
        "Confidence reflects the input path: gpuSeconds + known hardware -> 'med'; " +
        "tokens or flops only -> 'low'. Direct power measurement -> 'high' (not emitted by this tool).",
      inputSchema: {
        type: "object",
        required: ["subject", "compute"],
        properties: {
          subject: {
            type: "object",
            required: ["kind", "name"],
            properties: {
              kind: { type: "string", enum: ["model", "agent", "app"] },
              name: { type: "string" },
              version: { type: "string" },
            },
          },
          compute: {
            type: "object",
            description: "Provide at least one of: gpuSeconds, flops, tokens. gpuSeconds is preferred.",
            properties: {
              gpuSeconds: { type: "number", minimum: 0, description: "Wall-clock GPU-seconds across all accelerators." },
              flops:      { type: "number", minimum: 0, description: "Total FLOPs (FP16/BF16 equivalent)." },
              tokens:     { type: "number", minimum: 0, description: "Total tokens processed (input + output)." },
              hardware:   { type: "string", description: "Hardware key from aieds_factors() hardwareFactors." },
              modelScale: {
                type: "string",
                enum: ["small", "medium", "large"],
                description: "For token-based estimates: model parameter scale (<7B / 7B-70B / >70B).",
              },
            },
          },
          gridRegion: {
            type: "string",
            description: "Grid region key from aieds_factors() gridFactors. Defaults to 'global_average'.",
          },
        },
      },
    },
    {
      name: "aieds_factors",
      description:
        "Return the current AiEDs v1 factor tables: hardware power draw (W), " +
        "grid carbon intensities (gCO2e/kWh), token energy proxies (Wh/1M tokens), " +
        "and the J/TFLOP constant. Use these to build disclosures manually or audit estimates.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "aieds_disclose",
      description:
        "Validate a disclosure object against aieds.schema.json (AiEDs v2 JSON Schema draft 2020-12). " +
        "Returns {conforms, errors, methodologyBadge}. The badge is a short attestation string " +
        "for display or log embedding (e.g. 'AiEDs v1.0.0, med confidence'). " +
        "AiEDs disclosures are self-attested - this tool checks schema conformance only.",
      inputSchema: {
        type: "object",
        required: ["disclosure"],
        properties: {
          disclosure: {
            type: "object",
            description: "A disclosure record to validate against aieds.schema.json.",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "aieds_estimate") {
    const result = estimate(args as unknown as EstimateInput);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "aieds_factors") {
    const payload = {
      methodologyVersion: METHODOLOGY_VERSION,
      hardwareFactors: HARDWARE_FACTORS,
      gridFactors: GRID_FACTORS,
      tokenWhPerMillion: TOKENS_WH_PER_MILLION,
      joulesPerTflop: JOULES_PER_TFLOP,
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }

  if (name === "aieds_disclose") {
    const { disclosure } = args as { disclosure: unknown };
    const conforms = validateDisclosure(disclosure);
    const errors = conforms ? [] : (validateDisclosure.errors ?? []);
    const d = disclosure as Record<string, unknown>;
    const methodologyBadge = conforms
      ? `AiEDs v${d["methodologyVersion"]}, ${d["confidence"]} confidence`
      : null;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ conforms, errors, methodologyBadge }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

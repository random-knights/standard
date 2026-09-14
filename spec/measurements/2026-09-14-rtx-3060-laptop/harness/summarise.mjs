// Turns the committed raw files into summary.json.
//
// This step is SEPARATE from measure.mjs on purpose. The raw CSV and the raw
// run JSON are the evidence; the coefficient is a claim derived from them. A
// third party who does not trust the claim can re-derive it by running this
// file over the same committed bytes and comparing, which is exactly what the
// method document asks them to do.
//
// It reads only the filesystem. No GPU, no network, no Ollama.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  idleBaseline,
  parseSamples,
  round,
  runEnergy,
  samplingIntervalMs,
  summariseRuns,
} from "./lib/measure-math.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MEASUREMENT_DIR = resolve(HERE, "..");

function readSamples(path) {
  return parseSamples(readFileSync(path, "utf8"));
}

/**
 * Summarises one measurement directory.
 *
 * Deterministic by construction: sessions are visited in sorted filename
 * order, every figure is rounded to a fixed number of decimals, and no clock
 * is read. Running it twice over the same bytes produces the same bytes.
 */
export function summariseDirectory(dir = MEASUREMENT_DIR) {
  const rawDir = join(dir, "raw");
  const runFiles = readdirSync(rawDir)
    .filter((f) => f.endsWith("-runs.json"))
    .sort();

  const unloaded = readSamples(join(rawDir, "idle-unloaded.csv"));
  const unloadedIdle = idleBaseline(unloaded.samples);

  const sessions = [];
  let anyFake = false;
  for (const file of runFiles) {
    const payload = JSON.parse(readFileSync(join(rawDir, file), "utf8"));
    const meta = payload.session;
    const slug = file.replace(/-runs\.json$/, "");
    if (meta.fake) anyFake = true;

    const samples = readSamples(join(rawDir, `${slug}-samples.csv`));
    const loaded = readSamples(join(rawDir, `${slug}-idle-loaded.csv`));
    const loadedIdle = idleBaseline(loaded.samples);

    // The subtraction baseline. Loaded, not unloaded: what is being disclosed
    // is the MARGINAL energy of serving a request on a host that already holds
    // the model, so the standing residency draw is not charged to whichever
    // request happened to run. The unloaded figure is published beside it,
    // because the difference between the two IS the residency cost.
    const baselineW = loadedIdle.meanW;

    const runResults = payload.runs.map((r) =>
      runEnergy(r, samples.samples, baselineW, {
        tailSeconds: meta.tailSeconds,
      }),
    );
    const loadCall = runResults.find((r) => r.isLoadCall) ?? null;
    const summary = summariseRuns(runResults);
    const interval = samplingIntervalMs(samples.samples);

    sessions.push({
      slug,
      model: meta.model,
      metadata: meta,
      sampleRows: samples.totalRows,
      sampleRowsInvalid: samples.invalidRows,
      achievedSamplingIntervalMs: {
        median: round(interval.median, 1),
        q1: round(interval.q1, 1),
        q3: round(interval.q3, 1),
        min: round(interval.min, 1),
        max: round(interval.max, 1),
        n: interval.n,
      },
      idle: {
        loadedMeanW: round(loadedIdle.meanW, 3),
        loadedSeconds: round(loadedIdle.durationS, 1),
        loadedSamples: loadedIdle.n,
        unloadedMeanW: round(unloadedIdle.meanW, 3),
        unloadedSeconds: round(unloadedIdle.durationS, 1),
        unloadedSamples: unloadedIdle.n,
        residencyCostW:
          loadedIdle.meanW !== null && unloadedIdle.meanW !== null
            ? round(loadedIdle.meanW - unloadedIdle.meanW, 3)
            : null,
        baselineUsedForSubtraction: "loaded",
      },
      loadCall: loadCall
        ? {
            runId: loadCall.runId,
            loadMs: loadCall.loadMs,
            note:
              "Excluded from the distribution. It carries the one-off cost of " +
              "moving weights into VRAM, which is not a per-token cost.",
          }
        : null,
      ...summary,
      runs: runResults,
    });
  }

  return {
    dryRun: anyFake,
    measurementScope:
      "dGPU board power only (nvidia-smi power.draw). Host CPU, system " +
      "memory and the integrated GPU are NOT measured.",
    powerReadingAccuracyW: 5,
    scopeFence:
      "These coefficients describe the named hardware, runtime, model and " +
      "quantization only. They must not be applied to any other system, and " +
      "in particular not to hosted inference.",
    unloadedIdle: {
      meanW: round(unloadedIdle.meanW, 3),
      seconds: round(unloadedIdle.durationS, 1),
      samples: unloadedIdle.n,
    },
    sessions,
  };
}

const isMain = (() => {
  try {
    return resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const dir = process.argv[2] ? resolve(process.argv[2]) : MEASUREMENT_DIR;
  const summary = summariseDirectory(dir);
  writeFileSync(
    join(dir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  for (const s of summary.sessions) {
    process.stdout.write(
      `${s.model}: prefill median ${s.prefillWhPerMillionTokens.median} ` +
        `(IQR ${s.prefillWhPerMillionTokens.q1} to ${s.prefillWhPerMillionTokens.q3}), ` +
        `decode median ${s.decodeWhPerMillionTokens.median} ` +
        `(IQR ${s.decodeWhPerMillionTokens.q1} to ${s.decodeWhPerMillionTokens.q3}) ` +
        `Wh per million tokens, ${s.runsIncluded} runs\n`,
    );
  }
}

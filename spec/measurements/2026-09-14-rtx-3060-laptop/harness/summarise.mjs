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
  prefillByBand,
  round,
  runEnergy,
  samplingIntervalMs,
  summariseRuns,
} from "./lib/measure-math.mjs";
import { fitTwoTerm } from "./lib/fit.mjs";

const JOULES_PER_WH = 3600;

/**
 * The published two-term fit for one phase: energy_joules = a + b * tokens.
 *
 * WHY TWO TERMS. A single Wh-per-million-tokens coefficient divides a
 * per-request fixed cost by a varying token count, which is not a constant, and
 * on this hardware it produced an interquartile range wider than its own
 * median. `a` is the fixed cost and `b` the marginal per-token cost, so the
 * shape can express what the measurement actually found.
 *
 * Both terms are converted to Wh here and nowhere else, so the unit conversion
 * happens once. Intervals are reported by two independent methods: t-based,
 * which assumes normal homoscedastic residuals, and a seeded percentile
 * bootstrap over pairs, which assumes neither. Disagreement between them is
 * information, so both are published.
 */
function fitPhase(runs, phase) {
  const tokenKey = phase === "prefill" ? "promptTokens" : "completionTokens";
  const joulesKey = phase === "prefill" ? "prefillNetJoules" : "decodeNetJoules";
  const xs = [];
  const ys = [];
  for (const r of runs) {
    const x = r[tokenKey];
    const y = r[joulesKey];
    if (Number.isFinite(x) && x > 0 && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }
  const f = fitTwoTerm(xs, ys);
  if (f === null) return null;
  const q = f.diagnostics.quadratic;
  return {
    method: "ordinary least squares, energy_joules = a + b * tokens",
    intervalMethod:
      "t-based at 95 percent (df = n - 2) as the published interval; seeded " +
      "percentile bootstrap over pairs, 10000 resamples, as a " +
      "distribution-free cross-check",
    n: f.n,
    df: f.df,
    aWhPerRequest: round(f.a / JOULES_PER_WH, 6),
    aWhPerRequestCI: [
      round(f.aCI[0] / JOULES_PER_WH, 6),
      round(f.aCI[1] / JOULES_PER_WH, 6),
    ],
    aPValue: round(f.aPValue, 6),
    aDistinguishableFromZero: f.aPValue !== null ? f.aPValue < 0.05 : null,
    bWhPerToken: round(f.b / JOULES_PER_WH, 9),
    bWhPerTokenCI: [
      round(f.bCI[0] / JOULES_PER_WH, 9),
      round(f.bCI[1] / JOULES_PER_WH, 9),
    ],
    bWhPerMillionTokens: round((f.b / JOULES_PER_WH) * 1e6, 3),
    bWhPerMillionTokensCI: [
      round((f.bCI[0] / JOULES_PER_WH) * 1e6, 3),
      round((f.bCI[1] / JOULES_PER_WH) * 1e6, 3),
    ],
    bPValue: round(f.bPValue, 9),
    bootstrapAWhPerRequestCI: [
      round(f.bootstrap.aCI[0] / JOULES_PER_WH, 6),
      round(f.bootstrap.aCI[1] / JOULES_PER_WH, 6),
    ],
    bootstrapBWhPerTokenCI: [
      round(f.bootstrap.bCI[0] / JOULES_PER_WH, 9),
      round(f.bootstrap.bCI[1] / JOULES_PER_WH, 9),
    ],
    bootstrapResamples: f.bootstrap.resamples,
    bootstrapSeed: f.bootstrap.seed,
    tCritical: round(f.tCritical, 6),
    r2: round(f.diagnostics.r2, 6),
    residualStandardErrorJoules: round(f.diagnostics.residualStandardError, 6),
    residualMaxAbsJoules: round(f.diagnostics.residualMaxAbs, 6),
    absResidualVsTokensPearson: round(f.diagnostics.absResidualVsXPearson, 6),
    curvatureSignificant: q === null ? null : q.significant,
    curvaturePValue: q === null ? null : round(q.pValue, 9),
    curvatureNote:
      q !== null && q.significant
        ? "A quadratic term IS significant, so a straight line is the wrong " +
          "shape here and `a` is not a fixed cost: it is whatever the line " +
          "needs at zero tokens to compensate for curvature. Do not publish " +
          "this phase as a two-term coefficient."
        : "No significant quadratic term, so the affine two-term model is not " +
          "contradicted by these data.",
  };
}

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
    // The same set the distribution is built from: the load call and any run
    // with a disqualifying flag are out of both, so the median and the fit
    // describe identical data.
    const excludedIds = new Set(summary.excluded.map((e) => e.runId));
    const fittableRuns = runResults.filter((r) => !excludedIds.has(r.runId));
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
      // The two-term fit runs over exactly the runs the distribution uses, so
      // a reader comparing the median and the fit is comparing the same data.
      fit: {
        prefill: fitPhase(fittableRuns, "prefill"),
        decode: fitPhase(fittableRuns, "decode"),
      },
      // Prefill by prompt-length band (RK-124, methodology 2.3.0), over the
      // SAME included-run set the fit and the pooled distribution use. No
      // curve is fitted here; see measure-math.mjs prefillByBand.
      prefillBands: prefillByBand(fittableRuns),
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

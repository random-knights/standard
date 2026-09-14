// Pure math for the AiEDs measured-energy harness.
//
// Nothing in this file touches a GPU, a network, or the filesystem. That is
// deliberate: the summary arithmetic is the part a third party has to be able
// to check, and it is checked by test/measure-math.test.mjs with no hardware
// present.
//
// Units, stated once so no function has to restate them: timestamps are epoch
// MILLISECONDS, power is WATTS, energy is JOULES until the last step, and the
// published coefficient is Wh per MILLION tokens.

/**
 * A nvidia-smi CSV row, as produced by
 *   --query-gpu=timestamp,power.draw,clocks.sm,utilization.gpu,
 *               temperature.gpu,enforced.power.limit
 *   --format=csv,noheader,nounits
 *
 * Returns null for a row that is not a valid sample. A row is INVALID, never
 * "zero", when power.draw is not a finite number strictly greater than zero.
 * Number(null) is 0 and ?? does not catch zero, so a bad read would otherwise
 * arrive as a free token. It is rejected here instead.
 */
export function parseSampleLine(line) {
  const text = String(line).trim();
  if (text.length === 0) return null;
  const cells = text.split(",").map((c) => c.trim());
  if (cells.length < 6) return null;
  const tMs = parseNvidiaTimestamp(cells[0]);
  if (tMs === null) return null;
  const powerW = Number(cells[1]);
  if (!Number.isFinite(powerW) || powerW <= 0) return null;
  const smClockMhz = Number(cells[2]);
  const utilizationPct = Number(cells[3]);
  const temperatureC = Number(cells[4]);
  const enforcedPowerLimitW = Number(cells[5]);
  return {
    tMs,
    powerW,
    smClockMhz: Number.isFinite(smClockMhz) ? smClockMhz : null,
    utilizationPct: Number.isFinite(utilizationPct) ? utilizationPct : null,
    temperatureC: Number.isFinite(temperatureC) ? temperatureC : null,
    enforcedPowerLimitW: Number.isFinite(enforcedPowerLimitW)
      ? enforcedPowerLimitW
      : null,
  };
}

/**
 * "2026/09/14 15:45:33.163" (nvidia-smi prints LOCAL time) -> epoch ms.
 *
 * Built from components rather than handed to the Date string parser, because
 * that parser's behaviour on this shape is implementation-defined. Components
 * go through the local-time Date constructor, which is what the string means
 * and which handles a daylight-saving boundary correctly.
 */
export function parseNvidiaTimestamp(text) {
  const m = String(text)
    .trim()
    .match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const ms = m[7] === undefined ? 0 : Number(m[7].padEnd(3, "0"));
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    ms,
  );
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/** Parses a whole CSV body, counting the rows it had to reject. */
export function parseSamples(csvText) {
  const samples = [];
  let invalidRows = 0;
  let totalRows = 0;
  for (const line of String(csvText).split("\n")) {
    if (line.trim().length === 0) continue;
    totalRows += 1;
    const s = parseSampleLine(line);
    if (s === null) invalidRows += 1;
    else samples.push(s);
  }
  samples.sort((a, b) => a.tMs - b.tMs);
  return { samples, invalidRows, totalRows };
}

/** Linear interpolation of power between two samples, at time t. */
function interpolate(a, b, t) {
  if (b.tMs === a.tMs) return a.powerW;
  const f = (t - a.tMs) / (b.tMs - a.tMs);
  return a.powerW + f * (b.powerW - a.powerW);
}

/**
 * Trapezoidal integral of power over [startMs, endMs].
 *
 * Trapezoidal rather than rectangular because a GPU power series between two
 * samples is a slew, not a step. Window boundaries are interpolated rather
 * than snapped to the nearest sample, so the boundary error is bounded by the
 * power CHANGE across one sample interval instead of by a whole interval.
 *
 * Returns joules, the number of stored samples that fall inside the window,
 * and a `covered` flag that is false when the sample series does not span the
 * whole window. An uncovered window is a measurement failure, not a small
 * number, so the caller must check it.
 */
export function integrateWindow(samples, startMs, endMs) {
  const durationS = (endMs - startMs) / 1000;
  if (!(endMs > startMs)) {
    return { joules: 0, sampleCount: 0, covered: false, durationS: 0 };
  }
  if (samples.length < 2) {
    return { joules: 0, sampleCount: 0, covered: false, durationS };
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const covered = first.tMs <= startMs && last.tMs >= endMs;
  let joules = 0;
  let sampleCount = 0;
  for (let i = 0; i + 1 < samples.length; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    if (b.tMs <= startMs || a.tMs >= endMs) continue;
    const lo = Math.max(a.tMs, startMs);
    const hi = Math.min(b.tMs, endMs);
    if (!(hi > lo)) continue;
    const pLo = interpolate(a, b, lo);
    const pHi = interpolate(a, b, hi);
    joules += ((pLo + pHi) / 2) * ((hi - lo) / 1000);
  }
  for (const s of samples) {
    if (s.tMs >= startMs && s.tMs <= endMs) sampleCount += 1;
  }
  return { joules, sampleCount, covered, durationS };
}

/**
 * Energy attributable to one phase, after the idle baseline is subtracted.
 *
 * The baseline is the LOADED idle draw: weights resident in VRAM, no request
 * in flight. What is being disclosed is the MARGINAL energy of serving a
 * request on a host that already holds the model, so the standing residency
 * draw is not charged to whichever request happened to run.
 */
export function netEnergy(samples, startMs, endMs, idleWatts) {
  const w = integrateWindow(samples, startMs, endMs);
  const idleJoules = idleWatts * w.durationS;
  const netJoules = w.joules - idleJoules;
  return {
    grossJoules: w.joules,
    idleJoules,
    netJoules,
    durationS: w.durationS,
    sampleCount: w.sampleCount,
    covered: w.covered,
    meanGrossW: w.durationS > 0 ? w.joules / w.durationS : 0,
  };
}

export const JOULES_PER_WH = 3600;

/** Joules over a token count, expressed as Wh per million tokens. */
export function whPerMillionTokens(joules, tokens) {
  if (!Number.isFinite(tokens) || tokens <= 0) return null;
  return (joules / JOULES_PER_WH / tokens) * 1e6;
}

/**
 * Linear-interpolated quantile of a numeric array (the "type 7" definition
 * that R, numpy and every spreadsheet use). Written out rather than pulled
 * from a dependency: this repository's tooling is deliberately dependency-free
 * and a quantile is six lines.
 */
export function quantile(values, q) {
  const xs = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0];
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + (pos - lo) * (xs[hi] - xs[lo]);
}

export function median(values) {
  return quantile(values, 0.5);
}

/**
 * Median, quartiles and the spread test the methodology needs.
 *
 * `iqrWiderThanMedian` is the condition the dispatch names as a stop: a
 * coefficient whose interquartile range is wider than its own median is a
 * coefficient with no meaning, and the harness must say so rather than publish
 * it.
 */
export function distribution(values) {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) {
    return { n: 0, median: null, q1: null, q3: null, iqr: null, min: null, max: null, iqrWiderThanMedian: null };
  }
  const q1 = quantile(xs, 0.25);
  const q3 = quantile(xs, 0.75);
  const med = quantile(xs, 0.5);
  const iqr = q3 - q1;
  return {
    n: xs.length,
    median: med,
    q1,
    q3,
    iqr,
    min: Math.min(...xs),
    max: Math.max(...xs),
    iqrWiderThanMedian: med > 0 ? iqr > med : null,
  };
}

/**
 * The achieved sampling interval, which is NOT the requested one. On the
 * measured machine `-lms 50` delivered about 63 ms. The method document
 * reports what was achieved, so it is computed here from the timestamps.
 */
export function samplingIntervalMs(samples) {
  const deltas = [];
  for (let i = 0; i + 1 < samples.length; i += 1) {
    const d = samples[i + 1].tMs - samples[i].tMs;
    if (d > 0) deltas.push(d);
  }
  return distribution(deltas);
}

/** Rounds to a fixed number of decimals for stable, diffable JSON output. */
export function round(value, decimals) {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Turns one run record plus the sample series into the per-run energy result.
 *
 * WINDOW DERIVATION, and why it is anchored at the END. Ollama reports phase
 * DURATIONS but no absolute phase start. Streaming gives one trustworthy host
 * clock event, the arrival of the final chunk, so both windows are measured
 * backwards from it:
 *
 *   decode  = [tFinal - evalMs,               tFinal]
 *   prefill = [tFinal - evalMs - promptMs,    tFinal - evalMs]
 *
 * Anchoring prefill at the request send time instead would fold HTTP and queue
 * latency into prefill.
 */
export function runEnergy(run, samples, idleWatts, options = {}) {
  const minSamples = options.minSamplesPerPhase ?? 8;
  const maxResidualMs = options.maxResidualMs ?? 150;
  // THE TAIL. Measured on the sampled machine: board power ramps from about
  // 13 W to the 60 W enforced limit over roughly one second at the start of a
  // request, and decays back over a second or two AFTER the last token is
  // sent. That decay is real energy caused by the request, and it falls
  // outside both phase windows. Attributing it to decode would overstate a
  // per-token decode cost; ignoring it silently would understate the request.
  // So it is measured as its own window and published beside the two phases,
  // which makes the size of the undercount a number rather than a caveat.
  const tailMs = (options.tailSeconds ?? 2) * 1000;

  const evalMs = run.evalDurationNs / 1e6;
  const promptMs = run.promptEvalDurationNs / 1e6;
  const decodeEnd = run.tFinalMs;
  const decodeStart = decodeEnd - evalMs;
  const prefillEnd = decodeStart;
  const prefillStart = prefillEnd - promptMs;

  const prefill = netEnergy(samples, prefillStart, prefillEnd, idleWatts);
  const decode = netEnergy(samples, decodeStart, decodeEnd, idleWatts);
  const tail = netEnergy(samples, decodeEnd, decodeEnd + tailMs, idleWatts);
  const requestNetJoules = prefill.netJoules + decode.netJoules + tail.netJoules;

  const totalMs = run.totalDurationNs / 1e6;
  const loadMs = run.loadDurationNs / 1e6;
  const residualMs = run.tFinalMs - run.tSendMs - totalMs;
  const unaccountedMs = totalMs - (loadMs + promptMs + evalMs);

  const flags = [];
  if (!prefill.covered) flags.push("prefillWindowNotCovered");
  if (!decode.covered) flags.push("decodeWindowNotCovered");
  if (!tail.covered) flags.push("tailWindowNotCovered");
  if (prefill.sampleCount < minSamples) flags.push("prefillLowSampleCount");
  if (decode.sampleCount < minSamples) flags.push("decodeLowSampleCount");
  if (Math.abs(residualMs) > maxResidualMs) flags.push("largeResidual");
  if (prefill.netJoules <= 0) flags.push("prefillNetNotPositive");
  if (decode.netJoules <= 0) flags.push("decodeNetNotPositive");
  if (run.isLoadCall) flags.push("loadCall");

  return {
    runId: run.runId,
    model: run.model,
    promptTier: run.promptTier,
    completionCap: run.completionCap,
    promptTokens: run.promptEvalCount,
    completionTokens: run.evalCount,
    prefillMs: round(promptMs, 3),
    decodeMs: round(evalMs, 3),
    loadMs: round(loadMs, 3),
    totalMs: round(totalMs, 3),
    residualMs: round(residualMs, 3),
    unaccountedMs: round(unaccountedMs, 3),
    prefillWindow: [round(prefillStart, 0), round(prefillEnd, 0)],
    decodeWindow: [round(decodeStart, 0), round(decodeEnd, 0)],
    prefillSamples: prefill.sampleCount,
    decodeSamples: decode.sampleCount,
    prefillMeanGrossW: round(prefill.meanGrossW, 3),
    decodeMeanGrossW: round(decode.meanGrossW, 3),
    prefillGrossJoules: round(prefill.grossJoules, 6),
    decodeGrossJoules: round(decode.grossJoules, 6),
    prefillNetJoules: round(prefill.netJoules, 6),
    decodeNetJoules: round(decode.netJoules, 6),
    prefillWhPerMillionTokens: round(
      whPerMillionTokens(prefill.netJoules, run.promptEvalCount),
      3,
    ),
    decodeWhPerMillionTokens: round(
      whPerMillionTokens(decode.netJoules, run.evalCount),
      3,
    ),
    tailSeconds: round(tailMs / 1000, 3),
    tailSamples: tail.sampleCount,
    tailMeanGrossW: round(tail.meanGrossW, 3),
    tailNetJoules: round(tail.netJoules, 6),
    requestNetJoules: round(requestNetJoules, 6),
    tailShareOfRequestPct:
      tail.covered && requestNetJoules > 0
        ? round((tail.netJoules / requestNetJoules) * 100, 2)
        : null,
    isLoadCall: Boolean(run.isLoadCall),
    flags,
  };
}

/**
 * Collapses the per-run results into the published distribution.
 *
 * Runs that carry a disqualifying flag are EXCLUDED and counted, never
 * silently dropped: the summary names how many were excluded and why. The load
 * call is always excluded, because it carries the one-off cost of moving
 * weights into VRAM and is reported on its own instead.
 */
const DISQUALIFYING = new Set([
  "prefillWindowNotCovered",
  "decodeWindowNotCovered",
  "prefillNetNotPositive",
  "decodeNetNotPositive",
  "largeResidual",
  "loadCall",
]);

export function summariseRuns(runResults) {
  const included = [];
  const excluded = [];
  for (const r of runResults) {
    const bad = r.flags.filter((f) => DISQUALIFYING.has(f));
    if (bad.length > 0) excluded.push({ runId: r.runId, reasons: bad });
    else included.push(r);
  }
  const prefill = distribution(included.map((r) => r.prefillWhPerMillionTokens));
  const decode = distribution(included.map((r) => r.decodeWhPerMillionTokens));
  return {
    runsIncluded: included.length,
    runsExcluded: excluded.length,
    excluded,
    lowSampleCountRuns: included.filter((r) =>
      r.flags.some((f) => f.endsWith("LowSampleCount")),
    ).length,
    promptTokensTotal: included.reduce((a, r) => a + r.promptTokens, 0),
    completionTokensTotal: included.reduce((a, r) => a + r.completionTokens, 0),
    prefillWhPerMillionTokens: roundDistribution(prefill, 3),
    decodeWhPerMillionTokens: roundDistribution(decode, 3),
    // How much of each request's energy fell in the post-response power decay,
    // which neither phase coefficient carries. Published so the size of that
    // undercount is a measured number and not a sentence of hedging.
    tailShareOfRequestPct: roundDistribution(
      distribution(included.map((r) => r.tailShareOfRequestPct)),
      2,
    ),
  };
}

export function roundDistribution(d, decimals) {
  return {
    n: d.n,
    median: round(d.median, decimals),
    q1: round(d.q1, decimals),
    q3: round(d.q3, decimals),
    iqr: round(d.iqr, decimals),
    min: round(d.min, decimals),
    max: round(d.max, decimals),
    iqrWiderThanMedian: d.iqrWiderThanMedian,
  };
}

/** Mean power over a whole idle CSV, which is the baseline the runs subtract. */
export function idleBaseline(samples) {
  if (samples.length < 2) {
    return { meanW: null, durationS: 0, n: samples.length, distribution: distribution([]) };
  }
  const start = samples[0].tMs;
  const end = samples[samples.length - 1].tMs;
  const w = integrateWindow(samples, start, end);
  return {
    meanW: w.durationS > 0 ? w.joules / w.durationS : null,
    durationS: w.durationS,
    n: samples.length,
    distribution: distribution(samples.map((s) => s.powerW)),
  };
}

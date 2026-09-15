// Gate: the summary arithmetic of the measured-energy harness is correct, and
// it is checked WITHOUT a GPU, without Ollama, and without a network.
//
// The published coefficient is only as trustworthy as the arithmetic between
// the raw CSV and the number in the factor table. Every case below has an
// answer worked out by hand in its own comment, so a reader can check the test
// rather than trusting it.
//
// The last test drives the whole pipeline end to end through the harness's
// dry-run mode, which substitutes a FAKE sampler and a FAKE inference stub for
// nvidia-smi and Ollama. It writes real CSV and real JSON to a temporary
// directory and runs the real summariser over them.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  distribution,
  idleBaseline,
  integrateWindow,
  netEnergy,
  parseNvidiaTimestamp,
  parseSampleLine,
  parseSamples,
  quantile,
  round,
  runEnergy,
  samplingIntervalMs,
  summariseRuns,
  whPerMillionTokens,
} from "../lib/measure-math.mjs";
import { dryRun } from "../measure.mjs";
import { summariseDirectory } from "../summarise.mjs";

const T0 = parseNvidiaTimestamp("2026/09/14 12:00:00.000");

/** Builds a sample series at a fixed cadence from a list of watt values. */
function series(watts, stepMs = 100, startMs = T0) {
  return watts.map((powerW, i) => ({
    tMs: startMs + i * stepMs,
    powerW,
    smClockMhz: 1000,
    utilizationPct: 50,
    temperatureC: 50,
    enforcedPowerLimitW: 60,
  }));
}

test("a nvidia-smi timestamp parses as local time, to the millisecond", () => {
  const t = parseNvidiaTimestamp("2026/09/14 15:45:33.163");
  const d = new Date(t);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8); // September
  assert.equal(d.getDate(), 14);
  assert.equal(d.getHours(), 15);
  assert.equal(d.getMinutes(), 45);
  assert.equal(d.getSeconds(), 33);
  assert.equal(d.getMilliseconds(), 163);
  assert.equal(parseNvidiaTimestamp("not a timestamp"), null);
});

test("a zero or unreadable power sample is rejected, not counted as zero", () => {
  // The trap this exists for: Number(null) === 0 and ?? does not catch zero,
  // so a bad read would otherwise arrive as a free token and pull the median
  // down. It must be REJECTED.
  const good = "2026/09/14 15:45:33.163, 13.10, 210, 7, 42, 60.00";
  assert.ok(parseSampleLine(good));
  assert.equal(parseSampleLine(good).powerW, 13.1);

  assert.equal(parseSampleLine("2026/09/14 15:45:33.163, 0.00, 210, 7, 42, 60.00"), null);
  assert.equal(parseSampleLine("2026/09/14 15:45:33.163, [N/A], 210, 7, 42, 60.00"), null);
  assert.equal(parseSampleLine("2026/09/14 15:45:33.163, -1.0, 210, 7, 42, 60.00"), null);
  assert.equal(parseSampleLine(""), null);
  assert.equal(parseSampleLine("13.10, 210"), null);

  const csv = [
    "2026/09/14 15:45:33.163, 13.10, 210, 7, 42, 60.00",
    "2026/09/14 15:45:33.226, 0.00, 210, 7, 42, 60.00",
    "2026/09/14 15:45:33.289, 14.00, 210, 7, 42, 60.00",
  ].join("\n");
  const parsed = parseSamples(csv);
  assert.equal(parsed.totalRows, 3);
  assert.equal(parsed.invalidRows, 1);
  assert.equal(parsed.samples.length, 2);
});

test("a constant power series integrates to power times time", () => {
  // 50 W held for 2.000 s is 100.000 J, exactly.
  const s = series(new Array(21).fill(50), 100);
  const w = integrateWindow(s, s[0].tMs, s[20].tMs);
  assert.equal(round(w.joules, 6), 100);
  assert.equal(w.durationS, 2);
  assert.equal(w.sampleCount, 21);
  assert.equal(w.covered, true);
});

test("a ramp integrates trapezoidally, not rectangularly", () => {
  // 10 W rising linearly to 30 W over 1.000 s. The trapezoid is
  // (10 + 30) / 2 * 1 = 20.000 J. A left-rectangle rule would say 19.0 and a
  // right-rectangle rule 21.0, so this case separates the three.
  const s = series([10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], 100);
  const w = integrateWindow(s, s[0].tMs, s[10].tMs);
  assert.equal(round(w.joules, 6), 20);
});

test("window boundaries are interpolated, not snapped to a sample", () => {
  // Two samples 1.000 s apart: 10 W at t0, 30 W at t0 + 1000. The window
  // [t0 + 250, t0 + 750] sees 15 W at its start and 25 W at its end, so the
  // trapezoid is (15 + 25) / 2 * 0.5 = 10.000 J. Snapping to samples would
  // give 0 J (no sample inside) or 20 J (the whole interval).
  const s = series([10, 30], 1000);
  const w = integrateWindow(s, T0 + 250, T0 + 750);
  assert.equal(round(w.joules, 6), 10);
  assert.equal(w.sampleCount, 0);
  assert.equal(w.covered, true);
});

test("a window the samples do not span is reported as not covered", () => {
  const s = series([20, 20, 20], 100);
  const w = integrateWindow(s, s[0].tMs - 500, s[2].tMs);
  assert.equal(w.covered, false);
});

test("idle subtraction removes the standing draw over the window", () => {
  // 50 W for 2.000 s is 100 J gross. A 14 W loaded-idle baseline over the same
  // 2.000 s is 28 J, so the net attributable to the request is 72.000 J.
  const s = series(new Array(21).fill(50), 100);
  const n = netEnergy(s, s[0].tMs, s[20].tMs, 14);
  assert.equal(round(n.grossJoules, 6), 100);
  assert.equal(round(n.idleJoules, 6), 28);
  assert.equal(round(n.netJoules, 6), 72);
  assert.equal(round(n.meanGrossW, 6), 50);
});

test("joules over tokens becomes Wh per million tokens", () => {
  // 72 J is 72 / 3600 = 0.02 Wh. Over 1000 tokens that is 2e-5 Wh per token,
  // which is 20.000 Wh per million tokens.
  assert.equal(round(whPerMillionTokens(72, 1000), 6), 20);
  assert.equal(whPerMillionTokens(72, 0), null);
  assert.equal(whPerMillionTokens(72, -5), null);
});

test("quantiles use the linear-interpolation definition", () => {
  // [1, 2, 3, 4]: q1 = 1.75, median = 2.5, q3 = 3.25, so IQR = 1.5.
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0.75), 3.25);
  const d = distribution([4, 1, 3, 2]);
  assert.equal(d.n, 4);
  assert.equal(d.median, 2.5);
  assert.equal(d.iqr, 1.5);
  assert.equal(d.min, 1);
  assert.equal(d.max, 4);
  assert.equal(d.iqrWiderThanMedian, false);
});

test("a spread wider than its own median is flagged, because it is a stop", () => {
  // The dispatch's stop condition: a coefficient whose IQR exceeds its median
  // is a coefficient with no meaning. The harness must say so rather than
  // publish it, so the flag is computed, not judged later by a reader.
  const d = distribution([1, 1, 10, 100]);
  assert.equal(d.iqrWiderThanMedian, true);
});

test("the achieved sampling interval is computed, never assumed", () => {
  // The requested interval is a floor: -lms 50 delivered about 63 ms on the
  // measured machine. The method document reports what the timestamps show.
  const s = series([20, 20, 20, 20], 63);
  const i = samplingIntervalMs(s);
  assert.equal(i.n, 3);
  assert.equal(i.median, 63);
});

test("the idle baseline is the time-weighted mean over the whole CSV", () => {
  const s = series([12, 14, 16, 14, 12], 100);
  const b = idleBaseline(s);
  // Trapezoids: (12+14)/2 + (14+16)/2 + (16+14)/2 + (14+12)/2, each over 0.1 s
  // = (13 + 15 + 15 + 13) * 0.1 = 5.6 J over 0.4 s = 14.000 W.
  assert.equal(round(b.meanW, 6), 14);
  assert.equal(b.durationS, 0.4);
  assert.equal(b.n, 5);
});

test("run windows are anchored at the final chunk and measured backwards", () => {
  // A run whose decode took 1.000 s and whose prefill took 0.500 s, with the
  // final chunk received at t0 + 3000. Decode is therefore [2000, 3000] and
  // prefill [1500, 2000], both relative to t0.
  // 50 W held for 5.000 s, sampled every 50 ms, so both phases clear the
  // eight-sample floor that flags a thin window and the two-second tail
  // window is fully covered.
  const s = series(new Array(101).fill(50), 50);
  const run = {
    runId: "r1",
    model: "fake",
    promptTier: "medium",
    completionCap: 64,
    promptEvalCount: 1000,
    promptEvalDurationNs: 500e6,
    evalCount: 100,
    evalDurationNs: 1000e6,
    loadDurationNs: 0,
    totalDurationNs: 1520e6,
    tSendMs: T0 + 1480,
    tFinalMs: T0 + 3000,
    isLoadCall: false,
  };
  const r = runEnergy(run, s, 14);
  assert.deepEqual(r.prefillWindow, [T0 + 1500, T0 + 2000]);
  assert.deepEqual(r.decodeWindow, [T0 + 2000, T0 + 3000]);
  // Prefill: 50 W for 0.5 s = 25 J gross, minus 14 W * 0.5 s = 7 J, so 18 J.
  // 18 J / 3600 / 1000 tokens * 1e6 = 5.000 Wh per million tokens.
  assert.equal(r.prefillNetJoules, 18);
  assert.equal(r.prefillWhPerMillionTokens, 5);
  // Decode: 50 W for 1 s = 50 J gross, minus 14 J idle, so 36 J.
  // 36 J / 3600 / 100 tokens * 1e6 = 100.000 Wh per million tokens.
  assert.equal(r.decodeNetJoules, 36);
  assert.equal(r.decodeWhPerMillionTokens, 100);
  // Tail: the two seconds after the final chunk, where real board power is
  // still decaying from the enforced limit. 50 W for 2 s is 100 J gross, minus
  // 14 W * 2 s = 28 J idle, so 72 J. The whole request is 18 + 36 + 72 = 126 J,
  // and the tail is 72 / 126 = 57.14 per cent of it. On this synthetic series
  // the tail is deliberately large: the point of the assertion is that the
  // share is COMPUTED and published, not that it is small.
  assert.equal(r.tailNetJoules, 72);
  assert.equal(r.requestNetJoules, 126);
  assert.equal(r.tailShareOfRequestPct, 57.14);
  // total 1520 ms against an observed 1520 ms, so the residual is zero and the
  // unaccounted server time is 1520 - (0 + 500 + 1000) = 20 ms.
  assert.equal(r.residualMs, 0);
  assert.equal(r.unaccountedMs, 20);
  assert.deepEqual(r.flags, []);
});

test("the load call is excluded from the distribution and counted", () => {
  const mk = (runId, prefillWh, decodeWh, flags) => ({
    runId,
    promptTokens: 1000,
    completionTokens: 100,
    prefillWhPerMillionTokens: prefillWh,
    decodeWhPerMillionTokens: decodeWh,
    flags,
  });
  const s = summariseRuns([
    mk("load", 999, 9999, ["loadCall"]),
    mk("a", 5, 100, []),
    mk("b", 6, 110, []),
    mk("c", 7, 120, []),
    mk("d", 8, 130, []),
    mk("e", 1, 1, ["decodeWindowNotCovered"]),
  ]);
  assert.equal(s.runsIncluded, 4);
  assert.equal(s.runsExcluded, 2);
  assert.equal(s.prefillWhPerMillionTokens.median, 6.5);
  assert.equal(s.decodeWhPerMillionTokens.median, 115);
  assert.deepEqual(
    s.excluded.map((e) => e.runId).sort(),
    ["e", "load"],
  );
});

test("dry run: the whole pipeline produces a summary with no GPU present", async () => {
  // Fake sampler, fake inference, real CSV, real JSON, real summariser. This
  // is what proves the pipeline works before a single watt is measured, and it
  // is what CI runs.
  const dir = mkdtempSync(join(tmpdir(), "aieds-dryrun-"));
  try {
    const result = await dryRun(dir);
    assert.ok(result.sessions.length >= 1);

    const summary = summariseDirectory(dir);
    assert.equal(summary.dryRun, true);
    assert.ok(summary.sessions.length >= 1);
    const session = summary.sessions[0];
    assert.ok(session.runsIncluded >= 9, "the dry run sweep must produce runs");
    assert.ok(
      Number.isFinite(session.prefillWhPerMillionTokens.median),
      "prefill median must be a number",
    );
    assert.ok(
      Number.isFinite(session.decodeWhPerMillionTokens.median),
      "decode median must be a number",
    );
    assert.ok(session.idle.loadedMeanW > 0);

    // The fake sampler holds a known constant load, so the recovered
    // coefficient is predictable rather than merely present. See dryRun's
    // FAKE_* constants: 50 W under load, 14 W idle.
    assert.equal(round(session.idle.loadedMeanW, 3), 14);

    // Determinism: summarising the same directory twice is byte-identical.
    const a = JSON.stringify(summariseDirectory(dir));
    const b = JSON.stringify(summariseDirectory(dir));
    assert.equal(a, b);

    // The raw CSV really was written and really parses.
    const csvPath = join(dir, "raw", `${session.slug}-samples.csv`);
    const parsed = parseSamples(readFileSync(csvPath, "utf8"));
    assert.ok(parsed.samples.length > 0);
    assert.equal(parsed.invalidRows, 0);
    assert.equal(parsed.totalRows, session.sampleRows);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

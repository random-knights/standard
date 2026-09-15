// Gate: the two-term fit recovers a and b from data where a and b are KNOWN,
// reports intervals that actually cover them, and refuses to stay quiet when a
// straight line is the wrong shape.
//
// The published AiEDs measured-device entry is a + b * tokens. `a` is a
// per-request fixed cost and a NEW disclosure shape, so the arithmetic that
// produces it has to be checkable by someone who does not have the hardware.
// Every case below is synthetic, with the answer chosen before the fit runs.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fitTwoTerm,
  mulberry32,
  pearson,
  quadraticTest,
  studentTCdf,
  studentTQuantile,
} from "../lib/fit.mjs";
import { dryRun } from "../measure.mjs";
import { summariseDirectory } from "../summarise.mjs";

/** The run matrix's token counts, so the synthetic x has the real design. */
const TOKEN_TIERS = [252, 1528, 4370];
function designX(n = 36) {
  const xs = [];
  for (let i = 0; i < n; i += 1) xs.push(TOKEN_TIERS[i % TOKEN_TIERS.length]);
  return xs;
}

test("the Student t quantile matches published table values", () => {
  // Any statistics table: t(0.975) is 12.706 at 1 df, 2.228 at 10, 2.042 at 30,
  // and 2.032 at 34, which is the df of a 36-point two-term fit.
  assert.ok(Math.abs(studentTQuantile(0.975, 1) - 12.7062) < 1e-3);
  assert.ok(Math.abs(studentTQuantile(0.975, 10) - 2.2281) < 1e-3);
  assert.ok(Math.abs(studentTQuantile(0.975, 30) - 2.0423) < 1e-3);
  assert.ok(Math.abs(studentTQuantile(0.975, 34) - 2.0322) < 1e-3);
  // The CDF is a CDF.
  assert.ok(Math.abs(studentTCdf(0, 34) - 0.5) < 1e-12);
  assert.ok(studentTCdf(-5, 34) < studentTCdf(-1, 34));
  assert.ok(studentTCdf(5, 34) > studentTCdf(1, 34));
});

test("a noiseless line is recovered exactly", () => {
  // y = 5 + 0.02x, no noise. There is nothing for the fit to get wrong, so if
  // this fails the arithmetic is wrong rather than the data being hard.
  const xs = designX();
  const ys = xs.map((x) => 5 + 0.02 * x);
  const f = fitTwoTerm(xs, ys, { resamples: 200 });
  assert.ok(Math.abs(f.a - 5) < 1e-9, `a = ${f.a}`);
  assert.ok(Math.abs(f.b - 0.02) < 1e-12, `b = ${f.b}`);
  assert.ok(f.diagnostics.r2 > 1 - 1e-12);
  assert.ok(f.diagnostics.residualStandardError < 1e-9);
});

test("a known line plus noise is recovered, and both intervals cover the truth", () => {
  // y = 12.5 + 0.0175x plus deterministic noise of about 1.5 units. The
  // constants are chosen, not fitted, so "covers the truth" is a real claim.
  const A = 12.5;
  const B = 0.0175;
  const rand = mulberry32(20260914);
  const xs = designX();
  const ys = xs.map((x) => A + B * x + (rand() - 0.5) * 3);
  const f = fitTwoTerm(xs, ys, { resamples: 2000, seed: 99 });

  assert.equal(f.n, 36);
  assert.equal(f.df, 34);
  assert.ok(Math.abs(f.a - A) < 1.5, `a = ${f.a}, truth ${A}`);
  assert.ok(Math.abs(f.b - B) < 0.001, `b = ${f.b}, truth ${B}`);

  assert.ok(f.aCI[0] < A && A < f.aCI[1], `t-based a CI ${f.aCI} misses ${A}`);
  assert.ok(f.bCI[0] < B && B < f.bCI[1], `t-based b CI ${f.bCI} misses ${B}`);
  assert.ok(
    f.bootstrap.aCI[0] < A && A < f.bootstrap.aCI[1],
    `bootstrap a CI ${f.bootstrap.aCI} misses ${A}`,
  );
  assert.ok(
    f.bootstrap.bCI[0] < B && B < f.bootstrap.bCI[1],
    `bootstrap b CI ${f.bootstrap.bCI} misses ${B}`,
  );

  // A straight line IS the right shape here, so the curvature guard must stay
  // quiet. A guard that fires on clean linear data would be useless.
  assert.equal(f.diagnostics.quadratic.significant, false);
});

test("the bootstrap is deterministic, so a published interval is reproducible", () => {
  const rand = mulberry32(7);
  const xs = designX();
  const ys = xs.map((x) => 3 + 0.01 * x + (rand() - 0.5) * 2);
  const one = fitTwoTerm(xs, ys, { resamples: 1000, seed: 1234 });
  const two = fitTwoTerm(xs, ys, { resamples: 1000, seed: 1234 });
  assert.deepEqual(one.bootstrap.aCI, two.bootstrap.aCI);
  assert.deepEqual(one.bootstrap.bCI, two.bootstrap.bCI);
  const different = fitTwoTerm(xs, ys, { resamples: 1000, seed: 4321 });
  assert.notDeepEqual(one.bootstrap.aCI, different.bootstrap.aCI);
});

test("a near-zero intercept is reported as not distinguishable from zero", () => {
  // y = 0 + 0.03x plus noise. This is the shape decode is EXPECTED to have,
  // and the test that makes "decode has no fixed cost" a checkable claim
  // rather than a hope: the interval must straddle zero.
  const rand = mulberry32(31337);
  const xs = designX();
  const ys = xs.map((x) => 0.03 * x + (rand() - 0.5) * 2);
  const f = fitTwoTerm(xs, ys, { resamples: 2000, seed: 5 });
  assert.ok(f.aCI[0] < 0 && 0 < f.aCI[1], `a CI ${f.aCI} should straddle zero`);
  assert.ok(f.aPValue > 0.05, `a p = ${f.aPValue}`);
  assert.ok(f.bPValue < 1e-6, `b p = ${f.bPValue}`);
});

test("curvature is detected, because a line through a curve is a false claim", () => {
  // y = 1e-6 x^2, which is not affine in x. If the guard misses this, the fit
  // would publish whatever intercept the line needs at x = 0 to compensate for
  // the curvature, and call that a fixed per-request cost.
  const xs = designX();
  const ys = xs.map((x) => 1e-6 * x * x);
  const f = fitTwoTerm(xs, ys, { resamples: 200 });
  assert.equal(f.diagnostics.quadratic.significant, true);
  assert.ok(f.diagnostics.quadratic.pValue < 0.01);
  // And the standalone helper agrees.
  const q = quadraticTest(xs, ys);
  assert.ok(q.significant);
});

test("growing residual spread is reported, not hidden", () => {
  const rand = mulberry32(4242);
  const xs = designX();
  const ys = xs.map((x) => 2 + 0.01 * x + (rand() - 0.5) * x * 0.004);
  const f = fitTwoTerm(xs, ys, { resamples: 200 });
  assert.ok(
    f.diagnostics.absResidualVsXPearson > 0.3,
    `heteroscedasticity indicator ${f.diagnostics.absResidualVsXPearson}`,
  );
  assert.ok(Math.abs(pearson([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
});

test("too few points is null, never a confident answer from nothing", () => {
  assert.equal(fitTwoTerm([1, 2], [1, 2]), null);
  assert.equal(quadraticTest([1, 2, 3], [1, 2, 3]), null);
});

test("the summariser carries a fit for every model and both phases", async () => {
  // End to end through the dry run: fake sampler, fake inference, real files,
  // real summariser. This is what proves the fit is actually wired into the
  // published summary rather than merely existing in a library.
  const dir = mkdtempSync(join(tmpdir(), "aieds-fit-"));
  try {
    await dryRun(dir);
    const summary = summariseDirectory(dir);
    for (const session of summary.sessions) {
      for (const phase of ["prefill", "decode"]) {
        const f = session.fit[phase];
        assert.ok(f, `${session.slug} has no ${phase} fit`);
        assert.ok(Number.isFinite(f.aWhPerRequest), `${phase} a`);
        assert.ok(Number.isFinite(f.bWhPerToken), `${phase} b`);
        assert.equal(f.aWhPerRequestCI.length, 2);
        assert.equal(f.bWhPerTokenCI.length, 2);
        assert.equal(f.bootstrapAWhPerRequestCI.length, 2);
        assert.equal(f.bootstrapBWhPerTokenCI.length, 2);
        assert.ok(Number.isFinite(f.r2));
        assert.ok(typeof f.curvatureSignificant === "boolean");
        assert.equal(f.method, "ordinary least squares, energy_joules = a + b * tokens");
      }
    }
    // Determinism: the fit must not move the summary between runs, or a
    // published interval is not reproducible.
    assert.equal(
      JSON.stringify(summariseDirectory(dir)),
      JSON.stringify(summariseDirectory(dir)),
    );
    const onDisk = JSON.parse(readFileSync(join(dir, "raw", `${summary.sessions[0].slug}-runs.json`), "utf8"));
    assert.ok(onDisk.runs.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

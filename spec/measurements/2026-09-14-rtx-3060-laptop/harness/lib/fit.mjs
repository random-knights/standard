// Ordinary least squares for the AiEDs two-term energy model, with confidence
// intervals and the residual diagnostics that say whether the model fits.
//
// THE MODEL, and why it is two terms rather than one:
//
//     energy_joules = a + b * tokens
//
// `a` is a PER-REQUEST fixed cost and `b` the MARGINAL per-token cost. The
// current AiEDs per-token shape can only express `b`, which is why a single
// Wh-per-million-tokens coefficient measured on real hardware came out with an
// interquartile range wider than its own median: a fixed cost divided by a
// varying token count is not a constant, and pooling short and long requests
// mixes two different quantities.
//
// Nothing here touches a GPU, a network, or the filesystem, and nothing here
// reads a clock. Given the same inputs it returns the same numbers, bootstrap
// included, because the resampler is seeded.
//
// A FIT IS NOT A LICENSE. `a` and `b` mean something only if the residuals say
// a straight line describes the data. So every fit returns its diagnostics and
// the caller is expected to look at them: r2, the residual standard error, the
// slope of |residual| against x (heteroscedasticity), and a curvature test that
// refits with a quadratic term and reports whether it was needed. A two-term
// model published over a curved relationship is a worse claim than the pooled
// median it replaced, because it looks principled.

/** Deterministic PRNG (mulberry32), so the bootstrap is reproducible. */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Regularized incomplete beta function I_x(a, b), by the continued fraction in
 * Numerical Recipes. Needed for an exact Student t quantile, which is needed
 * for a t-based confidence interval. Written out because this repository's
 * tooling is deliberately dependency-free.
 */
function betacf(a, b, x) {
  const MAXIT = 200;
  const EPS = 3e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function logGamma(z) {
  // Lanczos approximation, g = 7, n = 9.
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zz = z - 1;
  let x = g[0];
  for (let i = 1; i < 9; i += 1) x += g[i] / (zz + i);
  const t = zz + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

export function regularizedIncompleteBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(a, b, x)) / a;
  return 1 - (Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + b * Math.log(1 - x) + a * Math.log(x),
  ) * betacf(b, a, 1 - x)) / b;
}

/** P(T <= t) for Student's t with `df` degrees of freedom. */
export function studentTCdf(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * regularizedIncompleteBeta(df / 2, 0.5, x);
  return t > 0 ? 1 - p : p;
}

/**
 * Two-sided critical value: the t with P(T <= t) = p, by bisection on the CDF.
 * Bisection rather than a closed form because there is no elementary one, and
 * an approximation would put an unstated error inside a published interval.
 */
export function studentTQuantile(p, df) {
  let lo = -200;
  let hi = 200;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function ols(xs, ys) {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - mx) * (xs[i] - mx);
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  return { a, b, mx, my, sxx, n };
}

/** Pearson correlation, used for the heteroscedasticity check. */
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Refits with a quadratic term and reports whether it was needed.
 *
 * This is the guard against publishing a straight line through a curve. If the
 * quadratic coefficient is significant, the affine two-term model is
 * MIS-SPECIFIED and `a` is not a fixed cost: it is whatever the line needs at
 * x = 0 to compensate for curvature, which can easily be negative and
 * physically meaningless.
 */
export function quadraticTest(xs, ys) {
  const n = xs.length;
  if (n < 4) return null;
  // Normal equations for y = c0 + c1 x + c2 x^2, solved by Gaussian
  // elimination on the 3x3 system. Centered on the mean of x to keep the
  // matrix well conditioned.
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const z = xs.map((x) => x - mx);
  let s0 = n;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let t0 = 0;
  let t1 = 0;
  let t2 = 0;
  for (let i = 0; i < n; i += 1) {
    const zi = z[i];
    const z2 = zi * zi;
    s1 += zi;
    s2 += z2;
    s3 += z2 * zi;
    s4 += z2 * z2;
    t0 += ys[i];
    t1 += zi * ys[i];
    t2 += z2 * ys[i];
  }
  const m = [
    [s0, s1, s2, t0],
    [s1, s2, s3, t1],
    [s2, s3, s4, t2],
  ];
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-300) return null;
    const tmp = m[col];
    m[col] = m[pivot];
    m[pivot] = tmp;
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c < 4; c += 1) m[r][c] -= f * m[col][c];
    }
  }
  const c = [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  let rss = 0;
  for (let i = 0; i < n; i += 1) {
    const zi = z[i];
    const pred = c[0] + c[1] * zi + c[2] * zi * zi;
    rss += (ys[i] - pred) ** 2;
  }
  const df = n - 3;
  const sigma2 = rss / df;
  // Standard error of c2 from the inverse of the normal matrix. Recomputed
  // here by solving the system against the unit vector e2 rather than storing
  // the inverse, which keeps this to one elimination routine.
  const a2 = [
    [s0, s1, s2, 0],
    [s1, s2, s3, 0],
    [s2, s3, s4, 1],
  ];
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(a2[r][col]) > Math.abs(a2[pivot][col])) pivot = r;
    }
    if (Math.abs(a2[pivot][col]) < 1e-300) return null;
    const tmp = a2[col];
    a2[col] = a2[pivot];
    a2[pivot] = tmp;
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = a2[r][col] / a2[col][col];
      for (let cc = col; cc < 4; cc += 1) a2[r][cc] -= f * a2[col][cc];
    }
  }
  const varC2 = sigma2 * (a2[2][3] / a2[2][2]);
  if (!(varC2 > 0)) return null;
  const seC2 = Math.sqrt(varC2);
  const tStat = c[2] / seC2;
  const pValue = 2 * (1 - studentTCdf(Math.abs(tStat), df));
  return { quadraticCoefficient: c[2], se: seC2, tStat, df, pValue, significant: pValue < 0.05 };
}

/**
 * Fits y = a + b x by OLS and returns both terms with 95% intervals, by two
 * independent methods, plus the residual diagnostics.
 *
 * `tBased` assumes the residuals are normal and homoscedastic. `bootstrap` is a
 * percentile bootstrap over (x, y) PAIRS, which assumes neither. Both are
 * reported: agreement between them is evidence the assumptions hold, and
 * disagreement is exactly the thing a single method would hide.
 */
export function fitTwoTerm(xs, ys, options = {}) {
  const resamples = options.resamples ?? 10000;
  const seed = options.seed ?? 0x5eed;
  const level = options.level ?? 0.95;
  const n = xs.length;
  if (n < 3) return null;

  const base = ols(xs, ys);
  const residuals = xs.map((x, i) => ys[i] - (base.a + base.b * x));
  const rss = residuals.reduce((s, r) => s + r * r, 0);
  const my = ys.reduce((s, v) => s + v, 0) / n;
  const tss = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  const df = n - 2;
  const sigma2 = rss / df;
  const seB = Math.sqrt(sigma2 / base.sxx);
  const seA = Math.sqrt(sigma2 * (1 / n + (base.mx * base.mx) / base.sxx));
  const tCrit = studentTQuantile(1 - (1 - level) / 2, df);

  // Percentile bootstrap over pairs.
  const rand = mulberry32(seed);
  const as = new Array(resamples);
  const bs = new Array(resamples);
  const rx = new Array(n);
  const ry = new Array(n);
  for (let s = 0; s < resamples; s += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = Math.floor(rand() * n);
      rx[i] = xs[k];
      ry[i] = ys[k];
    }
    const f = ols(rx, ry);
    as[s] = f.a;
    bs[s] = f.b;
  }
  as.sort((p, q) => p - q);
  bs.sort((p, q) => p - q);
  const lowIdx = Math.floor(((1 - level) / 2) * resamples);
  const highIdx = Math.min(resamples - 1, Math.ceil((1 - (1 - level) / 2) * resamples) - 1);

  const absResid = residuals.map((r) => Math.abs(r));

  return {
    n,
    a: base.a,
    b: base.b,
    seA,
    seB,
    df,
    tCritical: tCrit,
    level,
    aCI: [base.a - tCrit * seA, base.a + tCrit * seA],
    bCI: [base.b - tCrit * seB, base.b + tCrit * seB],
    aTStat: seA > 0 ? base.a / seA : null,
    bTStat: seB > 0 ? base.b / seB : null,
    aPValue: seA > 0 ? 2 * (1 - studentTCdf(Math.abs(base.a / seA), df)) : null,
    bPValue: seB > 0 ? 2 * (1 - studentTCdf(Math.abs(base.b / seB), df)) : null,
    bootstrap: {
      resamples,
      seed,
      aCI: [as[lowIdx], as[highIdx]],
      bCI: [bs[lowIdx], bs[highIdx]],
    },
    diagnostics: {
      r2: tss > 0 ? 1 - rss / tss : null,
      residualStandardError: Math.sqrt(sigma2),
      residualMaxAbs: Math.max(...absResid),
      // Heteroscedasticity: does the spread of the residuals grow with x?
      absResidualVsXPearson: pearson(xs, absResid),
      // Curvature: is a straight line the wrong shape?
      quadratic: quadraticTest(xs, ys),
    },
    residuals,
  };
}

// Emits the published forms of this measurement DIRECTLY from summary.json:
// the `measuredDevices` entries for spec/v2/aieds-factors.json, and the
// Table 4 rows for spec/methodology.md.
//
// WHY THIS EXISTS. Every number in the factor table and in the ratified prose
// has to trace to a raw sample file. Retyping a fitted coefficient and its
// interval into two other files is exactly where a digit goes wrong, and this
// repository already carries that scar: five copies of the coefficient data
// with nothing comparing them, which is how the Mature Reference Tree sat at
// 22 kg for a month after 2.0.0 unified it at 21. So both published forms are
// GENERATED here, and spec/test/measured-devices.test.mjs then gates them
// against each other in the other direction.
//
// Usage:
//   node harness/emit-factor-entry.mjs json     the measuredDevices block
//   node harness/emit-factor-entry.mjs table    the Table 4 rows
//   node harness/emit-factor-entry.mjs patch    writes the block into
//                                               spec/v2/aieds-factors.json
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEASUREMENT_DIR = resolve(HERE, "..");
const SPEC_DIR = resolve(MEASUREMENT_DIR, "..", "..");
const DIR_NAME = MEASUREMENT_DIR.split(/[\\/]/).pop();
const REPO_PATH = `spec/measurements/${DIR_NAME}`;

// The commit that published the raw data and the method document. A citation
// that names a directory but not a commit points at a moving target.
const DATA_COMMIT = "d9a3f0a029ed885bb4f76eff7ed35f6a70acfe7f";

const summary = JSON.parse(
  readFileSync(join(MEASUREMENT_DIR, "summary.json"), "utf8"),
);

const slug = (s) =>
  s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

const SCOPE_FENCE =
  "A measured device coefficient describes only the hardware, runtime, " +
  "model and quantization it names. It MUST NOT be applied to any other " +
  "system, and in particular MUST NOT be applied to hosted inference.";

function phaseBlock(f, phase) {
  const common = {
    runs: f.n,
    degreesOfFreedom: f.df,
    r2: f.r2,
    residualStandardErrorJoules: f.residualStandardErrorJoules,
    absResidualVsTokensPearson: f.absResidualVsTokensPearson,
    curvatureSignificant: f.curvatureSignificant,
    curvaturePValue: f.curvaturePValue,
    method: f.method,
    intervalMethod: f.intervalMethod,
  };
  if (f.curvatureSignificant) {
    return {
      status: "unresolved",
      ...common,
      reason:
        `The affine two-term model is MIS-SPECIFIED for ${phase} on this ` +
        "device. A quadratic term in tokens is significant, so energy is " +
        "convex in token count rather than affine, and the fitted intercept " +
        "is not a fixed per-request cost: it is whatever a straight line " +
        "needs at zero tokens to compensate for the curvature. On these data " +
        "that line predicts NEGATIVE energy inside the observed range, which " +
        "is not physical. No coefficient is published for this phase.",
      unresolvedNotApplicable:
        "UNRESOLVED, not NOT-APPLICABLE: this phase applies and its energy " +
        "was measured; it is the two-term SHAPE that cannot carry it yet.",
    };
  }
  return {
    status: "published",
    ...common,
    aWhPerRequest: f.aWhPerRequest,
    aWhPerRequestCI95: f.aWhPerRequestCI,
    aPValue: f.aPValue,
    aDistinguishableFromZero: f.aDistinguishableFromZero,
    aNote: f.aDistinguishableFromZero
      ? "A fixed per-request cost distinguishable from zero at 95 percent."
      : "NOT distinguishable from zero at 95 percent: the interval straddles " +
        "zero, so this phase shows no measurable fixed per-request cost. A " +
        "consumer may take a as zero and should carry the interval.",
    bWhPerToken: f.bWhPerToken,
    bWhPerTokenCI95: f.bWhPerTokenCI,
    bWhPerMillionTokens: f.bWhPerMillionTokens,
    bWhPerMillionTokensCI95: f.bWhPerMillionTokensCI,
    bPValue: f.bPValue,
    bootstrapAWhPerRequestCI95: f.bootstrapAWhPerRequestCI,
    bootstrapBWhPerTokenCI95: f.bootstrapBWhPerTokenCI,
    bootstrapResamples: f.bootstrapResamples,
    bootstrapSeed: f.bootstrapSeed,
  };
}

export function entries() {
  return summary.sessions.map((s) => {
    const m = s.metadata;
    const acc = m.accelerator;
    const md = m.modelDetail;
    const device = slug(acc.name.replace(/^NVIDIA GeForce /, ""));
    return {
      id: `${device}-${slug(m.runtime)}-${slug(m.model)}-${slug(md.quantization)}`,
      hardware: acc.name,
      acceleratorDriver: acc.driverVersion,
      enforcedPowerLimitW: acc.enforcedPowerLimitW,
      hostCpu: m.hostCpu,
      hostRamGb: m.hostRamGb,
      os: m.hostOs,
      runtime: m.runtime,
      model: m.model,
      architecture: md.architecture,
      parameters: md.parameters,
      quantization: md.quantization,
      contextLength: String(m.numCtx),
      batchSize: m.batchSize,
      measurementScope: m.measurementScope,
      instrumentAccuracy: m.powerReadingAccuracy,
      samplingIntervalMs: s.achievedSamplingIntervalMs.median,
      idleBaselineW: s.idle.loadedMeanW,
      idleBaselineBasis:
        "Loaded idle: model resident in VRAM, no request in flight, 60 s. " +
        `Unloaded idle measured ${s.idle.unloadedMeanW} W over 60 s; the ` +
        "difference is below this instrument's stated accuracy, so VRAM " +
        "residency cost is not resolvable here.",
      unloadedIdleW: s.idle.unloadedMeanW,
      tailExcluded: true,
      tailShareOfRequestPctMedian: s.tailShareOfRequestPct.median,
      tailNote:
        "Both phase fits EXCLUDE the post-response power decay, which is real " +
        "energy caused by the request but falls in neither phase window. Its " +
        "median share of a request's net energy is published here so the size " +
        "of the omission is a number rather than a caveat.",
      phases: {
        prefill: phaseBlock(s.fit.prefill, "prefill"),
        decode: phaseBlock(s.fit.decode, "decode"),
      },
      provenance: "measured",
      confidence: "high",
      measurementDirectory: REPO_PATH,
      measurementCommit: DATA_COMMIT,
      citation:
        `Random Knights, LLC (2026). Measured on ${acc.name}, driver ` +
        `${acc.driverVersion}, ${m.runtime}, ${m.model} ${md.quantization}, ` +
        `batch size 1, context ${m.numCtx}. Discrete GPU board power via ` +
        `nvidia-smi power.draw at about ${s.achievedSamplingIntervalMs.median} ` +
        `ms, loaded-idle baseline ${s.idle.loadedMeanW} W subtracted, ` +
        `${s.runsIncluded} runs. Method, harness and raw samples: ` +
        `${REPO_PATH}/README.md at commit ${DATA_COMMIT}.`,
    };
  });
}

export function block() {
  return {
    methodologySection: "2.3.1, Table 4",
    unit: "a in Wh per request, b in Wh per token",
    model: "energyWh = a + b * tokens, fitted per phase and per device",
    scopeFence: SCOPE_FENCE,
    note:
      "A per-request fixed cost `a` is a NEW disclosure shape. The AiEDs " +
      "per-token paths in sections 2.1 to 2.4 cannot express it, which is why " +
      "a single Wh-per-million-tokens figure measured on real hardware came " +
      "out with an interquartile range wider than its own median. Hosted " +
      "calls have no measured intercept and remain class-estimated with low " +
      "confidence.",
    entries: entries(),
  };
}

export function tableRows() {
  const lines = [];
  for (const e of entries()) {
    for (const phase of ["prefill", "decode"]) {
      const p = e.phases[phase];
      if (p.status !== "published") continue;
      const a = `${p.aWhPerRequest} (${p.aWhPerRequestCI95[0]} to ${p.aWhPerRequestCI95[1]})`;
      const b = `${p.bWhPerMillionTokens} (${p.bWhPerMillionTokensCI95[0]} to ${p.bWhPerMillionTokensCI95[1]})`;
      lines.push(
        `| ${e.hardware} | ${e.runtime} | ${e.model} | ${e.quantization} | ` +
          `${phase} | ${a} | ${b} | ${p.runs} |`,
      );
    }
  }
  return lines;
}

export function unresolvedRows() {
  const lines = [];
  for (const e of entries()) {
    for (const phase of ["prefill", "decode"]) {
      const p = e.phases[phase];
      if (p.status === "published") continue;
      lines.push(`| ${e.hardware} | ${e.model} | ${e.quantization} | ${phase} | ${p.runs} |`);
    }
  }
  return lines;
}

const what = process.argv[2] ?? "json";
if (what === "json") {
  process.stdout.write(`${JSON.stringify(block(), null, 2)}\n`);
} else if (what === "table") {
  process.stdout.write(`${tableRows().join("\n")}\n\nUNRESOLVED\n${unresolvedRows().join("\n")}\n`);
} else if (what === "patch") {
  const path = join(SPEC_DIR, "v2", "aieds-factors.json");
  const factors = JSON.parse(readFileSync(path, "utf8"));
  factors.measuredDevices = block();
  writeFileSync(path, `${JSON.stringify(factors, null, 2)}\n`, "utf8");
  process.stdout.write(`patched ${path}\n`);
} else {
  process.stderr.write("usage: emit-factor-entry.mjs [json|table|patch]\n");
  process.exitCode = 1;
}

// AiEDs measured-energy harness: sweep driver and power sampler.
//
// Dependencies: node (>=20), nvidia-smi, and a local Ollama HTTP API. Nothing
// else. No npm package is installed to run this, on purpose: a measurement
// whose toolchain a third party cannot reconstruct is not repeatable.
//
// WHAT IT DOES
//   1. Samples dGPU board power continuously for the whole sweep.
//   2. Records an idle baseline with the model resident and with nothing
//      resident, at least 60 s each.
//   3. Runs a deterministic matrix of prompt lengths by completion caps
//      against each local model, streaming, so the final chunk gives one
//      trustworthy host-clock anchor.
//   4. Writes the raw per-sample CSV and the per-run JSON. It computes no
//      coefficient: summarise.mjs does that, from the committed files.
//
// THE RULE THIS FILE EXISTS TO ENFORCE. `nvidia-smi -lms` NEVER exits on its
// own. Every sampler is started and stopped by this harness, the stop is in a
// `finally`, and stopAllSamplers() is registered on process exit and on SIGINT
// so an interrupted sweep still cleans up. After a run, `assertNoStraySampler`
// proves by process list that nothing survived.
//
// SCOPE, and it is not a footnote: nvidia-smi reports the DISCRETE GPU's BOARD
// power. Host CPU, system memory and the integrated GPU are NOT measured. Every
// number this harness produces is "dGPU board power during inference" and must
// be labeled exactly that. It is never "system power".
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MEASUREMENT_DIR = resolve(HERE, "..");

const OLLAMA = process.env.AIEDS_OLLAMA_URL ?? "http://127.0.0.1:11434";

/** Every sampler this process has started, so the exit hooks can stop them. */
const liveSamplers = new Set();

function stopAllSamplers() {
  for (const s of liveSamplers) {
    try {
      s.stop();
    } catch {
      // Stopping is best effort here; assertNoStraySampler is the real check.
    }
  }
}
process.on("exit", stopAllSamplers);
process.on("SIGINT", () => {
  stopAllSamplers();
  process.exit(130);
});

// ---------------------------------------------------------------------------
// Samplers
// ---------------------------------------------------------------------------

const QUERY_FIELDS = [
  "timestamp",
  "power.draw",
  "clocks.sm",
  "utilization.gpu",
  "temperature.gpu",
  // enforced.power.limit, NOT power.limit: on the measured laptop part
  // power.limit returns 4294967.50 W, which is the driver's 0xFFFFFFFF "not
  // set" sentinel in milliwatts and is not a power limit at all.
  "enforced.power.limit",
];

/** Spawns nvidia-smi and collects its rows until stop() is called. */
export class NvidiaSampler {
  constructor(intervalMs) {
    this.intervalMs = intervalMs;
    this.rows = [];
    this.child = null;
    this.buffer = "";
  }

  start() {
    this.child = spawn(
      "nvidia-smi",
      [
        `--query-gpu=${QUERY_FIELDS.join(",")}`,
        "--format=csv,noheader,nounits",
        `-lms`,
        String(this.intervalMs),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length > 0) this.rows.push(line.trim());
      }
    });
    liveSamplers.add(this);
    return this;
  }

  stop() {
    liveSamplers.delete(this);
    const child = this.child;
    this.child = null;
    if (!child || child.killed) return;
    try {
      child.kill();
    } catch {
      // fall through to taskkill
    }
    if (process.platform === "win32" && child.pid) {
      // Backstop. A killed console child on Windows can leave the process
      // object detached; taskkill /T /F is what actually guarantees it is gone.
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    }
  }
}

/**
 * The FAKE sampler used by the dry run and by the tests. It emits a constant
 * idle draw, and a constant loaded draw while `loadState.busy` is set, so the
 * pipeline can be exercised end to end with a known answer and no GPU.
 */
export const FAKE_IDLE_W = 14;
export const FAKE_LOAD_W = 50;
export const FAKE_INTERVAL_MS = 25;

export class FakeSampler {
  constructor(intervalMs, loadState) {
    this.intervalMs = intervalMs;
    this.loadState = loadState;
    this.rows = [];
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => {
      const now = new Date();
      const w = this.loadState.busy ? FAKE_LOAD_W : FAKE_IDLE_W;
      this.rows.push(
        [
          formatNvidiaTimestamp(now),
          w.toFixed(2),
          this.loadState.busy ? "1800" : "210",
          this.loadState.busy ? "99" : "0",
          "50",
          "60.00",
        ].join(", "),
      );
    }, this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    liveSamplers.add(this);
    return this;
  }

  stop() {
    liveSamplers.delete(this);
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}

function pad(n, width) {
  return String(n).padStart(width, "0");
}

/** The exact shape nvidia-smi prints, so the fake rows parse by the same code. */
export function formatNvidiaTimestamp(d) {
  return (
    `${d.getFullYear()}/${pad(d.getMonth() + 1, 2)}/${pad(d.getDate(), 2)} ` +
    `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.` +
    `${pad(d.getMilliseconds(), 3)}`
  );
}

/**
 * Proves nothing named nvidia-smi survived this process. Returns the count.
 * The harness reports the count; the lane report quotes it.
 */
export function strayNvidiaSmiCount() {
  if (process.platform !== "win32") {
    const r = spawnSync("pgrep", ["-x", "nvidia-smi"], { encoding: "utf8" });
    if (r.status === 1) return 0;
    return String(r.stdout ?? "").trim().split("\n").filter(Boolean).length;
  }
  const r = spawnSync(
    "tasklist",
    ["/FI", "IMAGENAME eq nvidia-smi.exe", "/NH", "/FO", "CSV"],
    { encoding: "utf8" },
  );
  const out = String(r.stdout ?? "");
  return out
    .split("\n")
    .filter((l) => l.toLowerCase().includes("nvidia-smi.exe")).length;
}

export function assertNoStraySampler() {
  const n = strayNvidiaSmiCount();
  if (n > 0) {
    throw new Error(
      `${n} nvidia-smi process(es) survived this harness. ` +
        `-lms never exits on its own; stop it before reporting.`,
    );
  }
  return n;
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One streamed generate call.
 *
 * Streaming is not a preference: it is what supplies the single host-clock
 * anchor (the arrival of the final chunk) that the phase windows are measured
 * backwards from. A non-streamed call gives durations with nothing to pin them
 * to but the request send time, which would fold HTTP and queue latency into
 * prefill.
 */
export async function generate({ model, prompt, numPredict, numCtx, keepAlive }) {
  const tSendMs = Date.now();
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
      keep_alive: keepAlive,
      options: {
        num_predict: numPredict,
        num_ctx: numCtx,
        temperature: 0,
        seed: 1,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status} for ${model}`);
  }
  let final = null;
  let tFirstChunkMs = null;
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    if (tFirstChunkMs === null) tFirstChunkMs = Date.now();
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      const obj = JSON.parse(line);
      if (obj.done) final = obj;
    }
  }
  if (buffer.trim().length > 0) {
    const obj = JSON.parse(buffer);
    if (obj.done) final = obj;
  }
  const tFinalMs = Date.now();
  if (final === null) throw new Error(`no final chunk from ${model}`);
  return {
    tSendMs,
    tFirstChunkMs,
    tFinalMs,
    promptEvalCount: final.prompt_eval_count ?? 0,
    promptEvalDurationNs: final.prompt_eval_duration ?? 0,
    evalCount: final.eval_count ?? 0,
    evalDurationNs: final.eval_duration ?? 0,
    loadDurationNs: final.load_duration ?? 0,
    totalDurationNs: final.total_duration ?? 0,
  };
}

/** The dry run's stand-in for Ollama: known durations, no network. */
async function fakeGenerate({ promptTokens, completionTokens, loadState, isLoadCall }) {
  const tSendMs = Date.now();
  const prefillMs = 200;
  const decodeMs = 400;
  const loadMs = isLoadCall ? 150 : 0;
  loadState.busy = true;
  try {
    await sleep(loadMs + prefillMs + decodeMs);
  } finally {
    loadState.busy = false;
  }
  const tFinalMs = Date.now();
  return {
    tSendMs,
    tFirstChunkMs: tSendMs + loadMs + prefillMs,
    tFinalMs,
    promptEvalCount: promptTokens,
    promptEvalDurationNs: prefillMs * 1e6,
    evalCount: completionTokens,
    evalDurationNs: decodeMs * 1e6,
    loadDurationNs: loadMs * 1e6,
    totalDurationNs: (tFinalMs - tSendMs) * 1e6,
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

// A deterministic filler. Token counts are RECORDED from the server's own
// prompt_eval_count, never assumed from the word count: the tiers below are
// nominal targets and the summary uses what actually happened.
//
// THE FILLER WAS CHANGED ONCE, and the reason belongs here. It was the NATO
// phonetic alphabet, which llama3.2:1b refused: "I can't provide a commentary
// on the list of military units". A refusal is 36 tokens long, so every decode
// window collapsed to about 50 ms and the decode coefficient was measured over
// nothing. The filler must be benign enough that the model simply works.
const FILLER_WORDS =
  "The harbor survey records tide height, wind direction and water " +
  "temperature at each station. Readings are taken hourly and logged with " +
  "the station identifier, the observer initials and a short note on sea " +
  "state. Older paper logbooks are transcribed in winter when the survey " +
  "boat is out of the water. ";

// A task the models reliably answer at LENGTH. Verified: llama3.2:1b runs to
// the num_predict cap on this instruction (done_reason "length") and stops
// after a few dozen tokens on an open-ended "comment on the text above".
// A decode coefficient measured over a 36-token refusal is not a measurement.
const LONG_OUTPUT_TASK =
  "\n\nNow write a long, continuous essay about the history of maritime " +
  "navigation, from early coastal pilotage through celestial navigation to " +
  "satellite positioning. Keep writing in full paragraphs and do not stop " +
  "early.";

export function buildPrompt(targetTokens, nonce) {
  // THE NONCE IS NOT DECORATION. Ollama caches the longest common prompt
  // PREFIX between consecutive requests, so repeating a tier's prompt makes
  // the second and later runs report a prefill of near zero: 319 tokens in
  // 52 ms on the first smoke run, against 1600 tokens per second when the
  // prefix genuinely differs. A cached prefill is a real thing to disclose
  // (methodology 2.4.1) but it is NOT what this harness is measuring, so the
  // nonce goes FIRST, where it breaks the shared prefix for every run.
  // It is derived from the run id, so the sweep stays deterministic.
  const head = `Reference ${nonce}. Survey transcript follows.\n\n`;
  // The filler paragraph measures 61 tokens on these models' tokenizer, read
  // from prompt_eval_count rather than counted by hand. The tier is nominal;
  // the recorded count is what the coefficient uses.
  const tokensPerRepeat = 61;
  const repeats = Math.max(1, Math.round(targetTokens / tokensPerRepeat));
  return head + FILLER_WORDS.repeat(repeats) + LONG_OUTPUT_TASK;
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

export function slugFor(model) {
  return model.replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}

function writeCsv(path, rows) {
  // NO header row, deliberately. The file is byte for byte what
  // `nvidia-smi --format=csv,noheader,nounits` printed, so a third party can
  // run the command in README.md and compare output directly, and so every
  // line in the file is a sample: a row count IS a sample count, with no
  // off-by-one to argue about. The column order is recorded as `csvColumns` in
  // the session JSON and in README.md.
  writeFileSync(path, `${rows.join("\n")}\n`, "utf8");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** `ollama ps` verbatim, so the GPU share is recorded and not asserted. */
export function ollamaPs() {
  const r = spawnSync("ollama", ["ps"], { encoding: "utf8" });
  return String(r.stdout ?? "").trim();
}

function nvidiaStatic() {
  const r = spawnSync(
    "nvidia-smi",
    [
      "--query-gpu=name,driver_version,memory.total,enforced.power.limit,power.default_limit,power.max_limit",
      "--format=csv,noheader,nounits",
    ],
    { encoding: "utf8" },
  );
  const cells = String(r.stdout ?? "").trim().split(",").map((c) => c.trim());
  return {
    name: cells[0] ?? null,
    driverVersion: cells[1] ?? null,
    memoryTotalMiB: cells[2] ? Number(cells[2]) : null,
    enforcedPowerLimitW: cells[3] ? Number(cells[3]) : null,
    powerDefaultLimitW: cells[4] ? Number(cells[4]) : null,
    powerMaxLimitW: cells[5] ? Number(cells[5]) : null,
  };
}

function ollamaShow(model) {
  const r = spawnSync("ollama", ["show", model], { encoding: "utf8" });
  const text = String(r.stdout ?? "");
  const grab = (key) => {
    const m = text.match(new RegExp(`^\\s*${key}\\s+(.+?)\\s*$`, "m"));
    return m ? m[1].trim() : null;
  };
  return {
    architecture: grab("architecture"),
    parameters: grab("parameters"),
    quantization: grab("quantization"),
    contextLength: grab("context length"),
  };
}

function ollamaVersion() {
  const r = spawnSync("ollama", ["--version"], { encoding: "utf8" });
  const m = String(r.stdout ?? "").match(/([\d]+\.[\d]+\.[\d]+)/);
  return m ? m[1] : null;
}

async function unloadModel(model) {
  try {
    await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0, prompt: "" }),
    });
  } catch {
    // An unload that fails is reported by the idle CSV itself: the unloaded
    // baseline would sit at the loaded level and the summary would show it.
  }
}

/**
 * Samples power for `seconds` with nothing else running, and returns the rows.
 * The sampler is stopped in a `finally`.
 */
async function sampleIdle(makeSampler, seconds) {
  const sampler = makeSampler().start();
  try {
    await sleep(seconds * 1000);
    return sampler.rows.slice();
  } finally {
    sampler.stop();
  }
}

/**
 * One model's whole sweep. Returns the session record; writes nothing.
 *
 * Note the order: warm-up (the LOAD call, recorded separately and excluded
 * from the distribution), then loaded idle, then the matrix. The load call is
 * first because until the weights are resident, "loaded idle" is not a thing
 * that exists.
 */
async function sweepModel({ model, config, makeSampler, fake, loadState, onProgress }) {
  const keepAlive = config.keepAlive;
  const numCtx = config.numCtx;
  const runs = [];

  const doGenerate = async ({ promptTier, completionCap, isLoadCall, index }) => {
    const targetTokens = config.promptTiers[promptTier];
    const runId = isLoadCall ? `${slugFor(model)}-load` : `${slugFor(model)}-${pad(index, 3)}`;
    let r;
    if (fake) {
      r = await fakeGenerate({
        promptTokens: targetTokens,
        completionTokens: completionCap,
        loadState,
        isLoadCall,
      });
    } else {
      r = await generate({
        model,
        prompt: buildPrompt(targetTokens, runId),
        numPredict: completionCap,
        numCtx,
        keepAlive,
      });
    }
    const record = { runId, model, promptTier, completionCap, isLoadCall, ...r };
    runs.push(record);
    if (onProgress) onProgress(record);
    return record;
  };

  const sampler = makeSampler().start();
  let idleLoadedRows = [];
  try {
    // 1. The load call. Cold, includes moving weights into VRAM, excluded.
    await doGenerate({
      promptTier: config.tierOrder[0],
      completionCap: config.completionCaps[0],
      isLoadCall: true,
      index: 0,
    });
    await sleep(config.settleMs);

    // 2. Loaded idle: weights resident, nothing in flight. This is the
    //    subtraction baseline.
    //
    //    The extra settle before the window is not politeness. Board power on
    //    this part decays from the 60 W enforced limit back to about 13 W over
    //    a second or two, and a six-second idle window taken straight after a
    //    request read 22.8 W: a contaminated baseline that made every net
    //    figure in the first smoke run NEGATIVE. The window opens only once
    //    the part has been quiet for idleSettleSeconds.
    await sleep(config.idleSettleSeconds * 1000);
    const idleStart = sampler.rows.length;
    await sleep(config.idleSeconds * 1000);
    idleLoadedRows = sampler.rows.slice(idleStart);

    // 3. The matrix, deterministic order, repeated.
    let index = 0;
    for (let rep = 0; rep < config.repeats; rep += 1) {
      for (const promptTier of config.tierOrder) {
        for (const completionCap of config.completionCaps) {
          index += 1;
          await doGenerate({ promptTier, completionCap, isLoadCall: false, index });
          await sleep(config.settleMs);
        }
      }
    }

    return {
      model,
      slug: slugFor(model),
      rows: sampler.rows.slice(),
      idleLoadedRows,
      runs,
      ps: fake ? "fake sampler: no model is resident" : ollamaPs(),
    };
  } finally {
    sampler.stop();
  }
}

function sessionMetadata({ model, config, fake }) {
  return {
    model,
    fake,
    accelerator: fake
      ? { name: "FAKE SAMPLER: no GPU was read", driverVersion: null }
      : nvidiaStatic(),
    modelDetail: fake
      ? { architecture: "fake", parameters: "0", quantization: "none", contextLength: "0" }
      : ollamaShow(model),
    runtime: fake ? "fake" : `Ollama ${ollamaVersion()}`,
    hostCpu: config.host.cpu,
    hostRamGb: config.host.ramGb,
    hostOs: config.host.os,
    ambient: config.host.ambient,
    batchSize: 1,
    numCtx: config.numCtx,
    csvColumns: QUERY_FIELDS,
    tailSeconds: config.tailSeconds,
    idleSettleSeconds: config.idleSettleSeconds,
    settleMs: config.settleMs,
    requestedSamplingIntervalMs: fake ? FAKE_INTERVAL_MS : config.samplingIntervalMs,
    measurementScope:
      "dGPU board power only (nvidia-smi power.draw). Host CPU, system " +
      "memory and the integrated GPU are NOT measured.",
    powerReadingAccuracy:
      "nvidia-smi --help-query-gpu, driver 527.99: power.draw is the last " +
      "measured power draw for the entire board, accurate to within +/- 5 watts.",
  };
}

/**
 * The real measurement. Writes into `outDir` (default: the measurement
 * directory beside this harness).
 */
export async function run(outDir = MEASUREMENT_DIR, options = {}) {
  const config = options.config ?? loadConfig();
  const fake = Boolean(options.fake);
  const loadState = { busy: false };
  const makeSampler = fake
    ? () => new FakeSampler(FAKE_INTERVAL_MS, loadState)
    : () => new NvidiaSampler(config.samplingIntervalMs);

  const rawDir = join(outDir, "raw");
  mkdirSync(rawDir, { recursive: true });

  const sessions = [];
  try {
    // Unloaded idle first, before anything is resident.
    for (const model of config.models) await unloadModel(model);
    await sleep(config.settleMs);
    const unloadedRows = await sampleIdle(makeSampler, config.idleSeconds);
    writeCsv(join(rawDir, "idle-unloaded.csv"), unloadedRows);

    for (const model of config.models) {
      const s = await sweepModel({
        model,
        config,
        makeSampler,
        fake,
        loadState,
        onProgress: options.onProgress,
      });
      writeCsv(join(rawDir, `${s.slug}-samples.csv`), s.rows);
      writeCsv(join(rawDir, `${s.slug}-idle-loaded.csv`), s.idleLoadedRows);
      writeJson(join(rawDir, `${s.slug}-runs.json`), {
        session: { ...sessionMetadata({ model, config, fake }), ollamaPs: s.ps },
        runs: s.runs,
      });
      sessions.push({ model, slug: s.slug, runs: s.runs.length, rows: s.rows.length });
      await unloadModel(model);
      await sleep(config.settleMs);
    }
    return { sessions, fake };
  } finally {
    stopAllSamplers();
  }
}

/** The dry run: real files, real summariser, fake sampler and fake inference. */
export async function dryRun(outDir) {
  const config = {
    ...loadConfig(),
    models: ["fake-model"],
    idleSeconds: 1,
    idleSettleSeconds: 0,
    settleMs: 200,
    tailSeconds: 0.1,
    repeats: 1,
  };
  return run(outDir, { config, fake: true });
}

export function loadConfig(path = join(MEASUREMENT_DIR, "config.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const isMain = (() => {
  try {
    return resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const fake = process.argv.includes("--dry-run");
  const started = Date.now();
  run(MEASUREMENT_DIR, {
    fake,
    onProgress: (r) => {
      const p = (r.promptEvalDurationNs / 1e9).toFixed(3);
      const d = (r.evalDurationNs / 1e9).toFixed(3);
      process.stdout.write(
        `${r.runId} prompt=${r.promptEvalCount} prefill=${p}s ` +
          `out=${r.evalCount} decode=${d}s\n`,
      );
    },
  })
    .then((result) => {
      const stray = assertNoStraySampler();
      process.stdout.write(
        `done in ${((Date.now() - started) / 1000).toFixed(1)}s; ` +
          `sessions=${result.sessions.length}; stray nvidia-smi=${stray}\n`,
      );
    })
    .catch((err) => {
      stopAllSamplers();
      process.stderr.write(`${err.stack ?? err}\n`);
      process.exitCode = 1;
    });
}

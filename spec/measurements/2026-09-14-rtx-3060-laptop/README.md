# Measured energy sample: RTX 3060 Laptop GPU, Ollama, llama3.2

Method document and raw data for a direct dGPU power measurement of local
inference, taken 2026-09-14. Everything needed to repeat it is in this
directory: the harness, the config that drove it, every raw power sample, every
per-run record, and the summary computed from them.

> **NO COEFFICIENT IS PUBLISHED FROM THIS MEASUREMENT YET.** Nothing here is in
> `spec/v2/aieds-factors.json` and nothing here changes `spec/methodology.md`.
> The measurement succeeded; one of its four candidate coefficients failed the
> publishability test, and the reason is a real property of the hardware rather
> than a defect in the run. See "Results" and "Why no coefficient was
> published". This directory is EVIDENCE, and evidence is worth committing on
> its own.

## THE SCOPE FENCE, first, because it is the most important line here

**These numbers describe one laptop.** They describe only the hardware, runtime,
model and quantization they name. They MUST NOT be applied to any other system,
and in particular MUST NOT be applied to hosted inference through the Anthropic,
OpenAI, Google or any other API.

A real measurement of one machine, presented as the energy of a different
machine, is a worse disclosure than an honest class estimate: it carries the
authority of a measurement and none of the applicability. Hosted calls stay
`class-estimated` and `low` (methodology section 5.1), and no measurement taken
here changes that.

## What was measured, and what was not

`nvidia-smi` reports the DISCRETE GPU's BOARD power. So:

| Included | Not included |
|---|---|
| The RTX 3060 Laptop GPU board: die, VRAM, board regulators | Host CPU (AMD Ryzen 7 5800H) |
| | System memory |
| | The integrated Radeon GPU |
| | Display, storage, chassis fans, PSU losses |

Every figure here is **dGPU board power during inference**. It is never system
power, and it must not be relabelled as such. A tool reporting PACKAGE power
rather than board power would be a different measurement again.

## Instrument and its stated accuracy

From `nvidia-smi --help-query-gpu` on driver 527.99, quoted rather than
paraphrased:

```
"power.draw"
The last measured power draw for the entire board, in watts. Only available if
power management is supported. This reading is accurate to within +/- 5 watts.
```

That +/- 5 W is ABSOLUTE and it is the dominant uncertainty in this
measurement. Idle here is about 13 W and loaded inference runs at the part's
60 W ceiling, so the net-of-idle signal is roughly 46 W and each of the two
terms carries its own +/- 5 W. NVIDIA does not say whether the error is a fixed
offset or random noise. If it is a fixed offset, idle subtraction cancels most
of it; if it is random, it does not. **This document does not assume the
favourable case.** The figures below are reported to three decimals because
that is what the arithmetic produces, not because they are accurate to three
decimals.

Two further instrument facts, both read off this machine:

- The driver samples power internally about every 14.6 ms
  (`nvidia-smi -q -d POWER` reported 119 samples over 8.16 s), and `power.draw`
  returns the LAST such sample. A reading is therefore a recent instantaneous
  value, not an average over the polling interval.
- `power.limit` on this part returns **4294967.50 W**, which is the driver's
  0xFFFFFFFF milliwatt "not set" sentinel and is not a power limit. The real
  ceiling is `enforced.power.limit`, **60.00 W**, and that is what the harness
  records. Anyone repeating this must not record the sentinel as a limit.

## The machine

| Field | Value |
|---|---|
| Accelerator | NVIDIA GeForce RTX 3060 Laptop GPU, 6144 MiB |
| Driver | 527.99 (CUDA 12.0) |
| Enforced power limit | 60.00 W (default 60.00 W, max 100.00 W) |
| Host CPU | AMD Ryzen 7 5800H with Radeon Graphics |
| RAM | 15.4 GB |
| OS | Microsoft Windows 11 Home 10.0.26200 build 26200 |
| Serving runtime | Ollama 0.34.0, `http://127.0.0.1:11434` |
| Models | `llama3.2:1b` (llama, 1.2B, Q8_0) and `llama3.2:latest` (llama, 3.2B, Q4_K_M) |
| Context length | 8192 (`num_ctx`), both models |
| Batch size | 1 |
| Ambient conditions | UNKNOWN. This machine has no ambient sensor and none is claimed. |

Both models were verified resident at **100% GPU** via `ollama ps` for their
whole sweep, and the verbatim `ollama ps` output is recorded in each session's
`raw/<model>-runs.json`. If a model had spilled layers to the CPU the
measurement would be invalid for it, because `nvidia-smi` cannot see that work.

Only one model is resident at a time. The harness unloads the other first. With
both resident (4.7 GB of 6144 MiB) decode on the 3B model fell to about 5 tokens
per second, against about 74 with it alone, so a sweep run that way would
measure contention rather than the model.

## Method

### 1. The power series

One `nvidia-smi` process per sweep, sampling continuously:

```
nvidia-smi --query-gpu=timestamp,power.draw,clocks.sm,utilization.gpu,temperature.gpu,enforced.power.limit --format=csv,noheader,nounits -lms 10
```

The raw CSVs in `raw/` are exactly what that command printed, with no header row
added, so they can be compared against a fresh run directly. Columns are in the
order above and are also recorded as `csvColumns` in each session JSON.

`-lms 10` is a REQUESTED interval and is a FLOOR, not a promise. On this machine
`-lms 50` delivered about 63 ms and `-lms 10` delivers about 15.5 ms, which is
the driver's own internal sampling rate. The ACHIEVED interval is computed from
the timestamps and is reported in `summary.json`; it is the one this document
quotes.

**`nvidia-smi -lms` never exits on its own.** The harness starts it and stops it
in a `finally`, registers the same stop on process exit and on SIGINT, and
verifies by process list that nothing named `nvidia-smi` survived. Piping it to
`head` does not stop it.

### 2. Idle baselines, both of them

- **Loaded idle**: model resident in VRAM, no request in flight, at least 60 s.
- **Unloaded idle**: nothing resident at all, at least 60 s.

The SUBTRACTION baseline is the LOADED idle. What a per-token coefficient should
express is the MARGINAL energy of serving a request on a host that already holds
the model. Weights resident in VRAM draw power whether or not a request is in
flight, so charging that standing draw to whichever request happened to run
would make the coefficient depend on request rate instead of on work done. The
unloaded figure is published beside it because the difference between the two IS
the residency cost, and a reader who wants an all-in figure needs it.

The idle window opens only after the part has been quiet for 20 s. This is not
politeness: board power decays from the 60 W ceiling back to about 13 W over one
to two seconds, and a first attempt that opened a 6 s idle window immediately
after a request measured **22.8 W** instead of about 14 W. That contaminated
baseline made every net figure in that run NEGATIVE. The number in this document
is what the corrected procedure produced.

### 3. Phase windows, and how the power samples are aligned to them

Ollama reports `prompt_eval_duration` and `eval_duration` per call, but no
absolute start time for either phase. The harness streams the response so that
the arrival of the final chunk gives ONE trustworthy host-clock anchor, and both
windows are measured backwards from it:

```
t_final          host clock when the final (done) chunk arrives
decode window    [t_final - eval_duration,                      t_final]
prefill window   [t_final - eval_duration - prompt_eval_duration,
                  t_final - eval_duration]
```

Anchoring prefill at the request send time instead would fold HTTP and queue
latency into prefill.

Three alignment errors are RECORDED per run rather than argued about:

1. `residualMs` = `(t_final - t_send) - total_duration`: host-observed time the
   server does not account for. A run exceeding 150 ms is excluded.
2. `unaccountedMs` = `total_duration - (load + prompt_eval + eval)`: time inside
   the server belonging to neither phase. Energy drawn during it is attributed
   to NEITHER phase, which is the honest choice.
3. Boundary quantisation: a window edge falls between two samples. The
   integrator interpolates linearly at the edge rather than snapping to a
   sample, so the error is bounded by the power CHANGE across one sample
   interval rather than by a whole interval.

### 4. Integration and the tail

Energy over a window is a TRAPEZOIDAL integral of the power series, with linear
interpolation at both boundaries, because the series between two samples is a
slew and not a step:

```
E_joules = sum over overlapping sample intervals of
             ((p_lo + p_hi) / 2) x overlap_seconds
E_net    = E_joules - idle_loaded_W x window_seconds
Wh_per_million_tokens = E_net / 3600 / tokens x 1e6
```

**The tail is measured too, and this matters.** Board power on this part ramps
from about 13 W to the 60 W ceiling over roughly a second at the start of a
request, and decays back over a second or two AFTER the final token is sent.
The ramp-up falls inside the prefill window and is correctly charged there. The
decay does not fall inside either phase window. Attributing it to decode would
overstate a per-token decode cost; ignoring it silently would understate the
request. So it is measured as its own window, published per run as
`tailNetJoules` and `tailShareOfRequestPct`, and summarized as a distribution.
**The two phase figures therefore do not include the tail, and the size of that
omission is a measured number in `summary.json`, not a caveat.**

### 5. The run matrix

3 prompt tiers x 3 completion caps x 4 repeats = **36 runs per model**, in a
deterministic order from `config.json`, plus one LOAD call which is excluded
from the distribution and reported separately.

Nominal tiers are about 200, 1500 and 4500 prompt tokens, and caps are 64, 192
and 448 completion tokens. Tiers are targets; every figure uses the server's own
`prompt_eval_count` and `eval_count`. Tiers were chosen so each phase spans many
samples at the achieved interval: the shortest prefill observed was about
0.15 s, the longest about 5.7 s.

Two prompt-construction decisions are load bearing:

- **Every run's prompt starts with a unique nonce derived from its run id.**
  Ollama caches the longest common prompt PREFIX, so a repeated tier prompt made
  the second and later runs report a prefill of near zero: 319 tokens in 52 ms
  against about 1600 tokens per second when the prefix genuinely differs. Cached
  prefill is a real thing to disclose (methodology 2.4.1), but it is not what
  this harness measures.
- **The filler text is a benign harbor-survey paragraph, and the task asks for
  a long essay.** The first filler was the NATO phonetic alphabet, which
  `llama3.2:1b` refused: "I can't provide a commentary on the list of military
  units". A refusal is 36 tokens, so every decode window collapsed to about
  50 ms. A decode coefficient measured over a refusal is not a measurement.

### 6. What is excluded, and why

A run is dropped from the distribution, and counted in `excluded`, if any of:

| Reason | Why |
|---|---|
| `loadCall` | Carries the one-off cost of moving weights into VRAM. Reported separately. |
| `prefillWindowNotCovered`, `decodeWindowNotCovered` | The sample series does not span the window, so there is nothing to integrate. |
| `prefillNetNotPositive`, `decodeNetNotPositive` | Net of idle came out at or below zero: a contaminated baseline or a window too short to see the ramp. Not a free token. |
| `largeResidual` | More than 150 ms of host-observed time the server cannot account for, so the anchor is not trustworthy. |

A sample whose `power.draw` is not a finite number strictly greater than zero is
an INVALID READ and is rejected, not counted as zero. `Number(null)` is 0 and
`??` does not catch zero, so a bad read would otherwise arrive as free energy.

Runs with a thin window (fewer than 8 samples in a phase) are FLAGGED and kept,
never silently dropped, so a reader can see which ones are thin.

## Repeating this

From a clone of this repository, with an NVIDIA GPU, Ollama running, and node 20
or newer. No npm install is needed; the harness has no dependencies.

```
ollama pull llama3.2:1b
ollama pull llama3.2
cd spec/measurements/2026-09-14-rtx-3060-laptop
node harness/measure.mjs          # about 15 minutes; writes raw/
node harness/summarise.mjs        # writes summary.json
```

Check the arithmetic without any hardware at all:

```
cd spec/measurements/2026-09-14-rtx-3060-laptop/harness
node --test test/measure-math.test.mjs
```

That suite drives the whole pipeline through a dry-run mode with a fake sampler
and a fake inference stub, and every integration case in it has its expected
answer worked out by hand in a comment. It runs in this repository's CI, in the
`spec` job.

To check that the published summary really comes from the published raw data,
re-run the summariser over the committed bytes and diff:

```
node harness/summarise.mjs        # rewrites summary.json in place
git diff --exit-code summary.json
```

## Files

| Path | What it is |
|---|---|
| `config.json` | The run matrix and the host facts, as driven |
| `harness/measure.mjs` | Sampler and sweep driver. Computes no coefficient. |
| `harness/summarise.mjs` | Raw files to `summary.json`. Reads only the filesystem. |
| `harness/lib/measure-math.mjs` | The arithmetic. No GPU, no network, no filesystem. |
| `harness/test/measure-math.test.mjs` | The gate on that arithmetic |
| `raw/idle-unloaded.csv` | Unloaded idle power series |
| `raw/<model>-idle-loaded.csv` | Loaded idle power series, per model |
| `raw/<model>-samples.csv` | The whole sweep's power series, per model |
| `raw/<model>-runs.json` | Session citation fields and every run record |
| `summary.json` | Medians, quartiles and per-run results, computed from the raw files |

## Results

The sweep ran for 988.6 s. 36 included runs per model, one excluded load call
each, **zero** runs excluded for any measurement fault, **zero** thin-window
runs, and **zero** invalid power samples out of 48,684 rows. Achieved sampling
interval: median 16 ms on both sessions.

### Idle baselines

| Model resident | Loaded idle | Unloaded idle | Difference |
|---|---|---|---|
| llama3.2:1b | 13.229 W | 13.486 W | -0.257 W |
| llama3.2:latest | 13.407 W | 13.486 W | -0.078 W |

Both idle windows are 60 s. **The residency cost of holding a model in VRAM is
not measurable on this instrument.** Both differences are negative and both are
far inside the +/- 5 W the vendor states, so the honest reading is "below the
noise floor", not "negative". It does mean the choice of loaded rather than
unloaded idle as the subtraction baseline changes the published figures by less
than the instrument can resolve.

### Candidate coefficients, Wh per million tokens, net of loaded idle

| Model | Phase | Median | IQR | Min | Max | Runs | IQR wider than median |
|---|---|---|---|---|---|---|---|
| llama3.2:1b Q8_0 | prefill | 2.922 | 2.513 to 5.642 | 0.485 | 6.143 | 36 | **YES** |
| llama3.2:1b Q8_0 | decode | 92.173 | 78.547 to 105.741 | 24.118 | 116.249 | 36 | no |
| llama3.2:latest Q4_K_M | prefill | 11.282 | 4.783 to 15.039 | 1.827 | 15.850 | 36 | no |
| llama3.2:latest Q4_K_M | decode | 188.280 | 172.879 to 205.284 | 108.362 | 218.559 | 36 | no |

### The same runs, split by prompt tier, which is the finding

| Model | Tier | Prompt tokens | Prefill median | IQR width | Mean dGPU power | Phase duration |
|---|---|---|---|---|---|---|
| llama3.2:1b | short | 252 | 2.474 | 2.429 | 20.1 W | 0.37 s |
| llama3.2:1b | medium | 1528 | 2.848 | 0.194 | 28.5 W | 1.03 s |
| llama3.2:1b | long | 4370 | 5.897 | 0.293 | 46.3 W | 2.75 s |
| llama3.2:latest | short | 251 | 3.207 | 1.508 | 20.3 W | 0.54 s |
| llama3.2:latest | medium | 1527 | 11.282 | 0.713 | 42.9 W | 2.07 s |
| llama3.2:latest | long | 4369 | 15.261 | 0.611 | 53.9 W | 5.93 s |

And by completion cap:

| Model | Cap | Decode median | IQR width | Mean dGPU power | Phase duration |
|---|---|---|---|---|---|
| llama3.2:1b | 64 | 87.919 | 69.307 | 53.0 W | 0.50 s |
| llama3.2:1b | 192 | 92.173 | 34.153 | 57.2 W | 1.48 s |
| llama3.2:1b | 448 | 95.345 | 22.582 | 58.7 W | 3.39 s |
| llama3.2:latest | 64 | 187.148 | 75.469 | 59.8 W | 0.93 s |
| llama3.2:latest | 192 | 186.227 | 41.041 | 59.7 W | 2.78 s |
| llama3.2:latest | 448 | 189.256 | 30.810 | 59.7 W | 6.61 s |

### Other measured quantities

| Quantity | llama3.2:1b | llama3.2:latest |
|---|---|---|
| Tail share of a request's net energy, median | 29.86% | 14.82% |
| Tail share, IQR | 22.61 to 49.50% | 11.74 to 30.27% |
| Cold load call duration | 39.951 s | 60.810 s |
| Host-observed residual, median (max) | 5.25 ms (10.97) | 5.50 ms (18.35) |
| Server time in neither phase, median | 34.54 ms | 193.22 ms |
| Raw sample rows | 20,809 | 27,875 |

## Why no coefficient was published

The measurement is sound. The `llama3.2:1b` PREFILL figure is not publishable,
and the reason is visible in the tier split above.

**Per-token prefill energy on this device is a function of prompt length, not a
constant.** Mean dGPU power during prefill rises from about 20 W on a 0.37 s
prefill to about 46 W on a 2.75 s one, because board power ramps from the 13 W
idle level toward the 60 W ceiling over roughly a second and a short prefill
never gets there. So the short tier costs 2.474 Wh per million tokens and the
long tier costs 5.897, a factor of 2.4, on the same model and the same machine.

Within each tier the spread is TIGHT: IQR widths of 0.194, 0.293, 0.713 and
0.611 on the three well-sampled tiers. It is only the POOLING of three different
populations into one distribution that produces an interquartile range wider
than the median. A single pooled prefill coefficient would therefore be a number
whose error bar swamps it, which is exactly what the published methodology
refuses to carry.

The 3B model's pooled prefill (IQR width 10.256 against a median of 11.282)
passes the same test by a margin of one part in eleven. Passing narrowly for the
same reason the other one failed is not a basis to publish it.

Decode is a different story and is well behaved: 87.9 / 92.2 / 95.3 across three
completion caps on the 1B model, and 187.1 / 186.2 / 189.3 on the 3B. Decode
runs at the 60 W ceiling for essentially its whole window, so the ramp is a
smaller fraction of it and per-token cost is close to flat.

**What would fix it, and it is an owner decision, not an agent's.** Either
publish prefill coefficients STRATIFIED by prompt length, which the data already
supports with tight per-tier spreads, or define the coefficient on a basis where
the ramp is not a confound. That changes the shape of a factor-table entry, so
it is a methodology design decision and this lane stopped rather than invent
one.

**One comparison, made carefully.** The measured 1B decode median of 92.2 Wh per
million tokens sits close to Table 2's class estimate of 100 for "small, under
7B", and the 3B model's 188.3 is about twice it. This is NOT a validation of
Table 2: Table 2 is derived from A100 and H100 benchmarks and this is a laptop
part at a 60 W ceiling measuring the dGPU only. Two numbers that describe
different systems landing near each other is a coincidence worth noting and
nothing more.

## Known limits

Stated plainly, because a measurement whose limits are buried is not repeatable.

1. **dGPU board power only.** Host CPU, memory and integrated GPU are not
   measured. The all-in energy of these runs is HIGHER than the figures here.
2. **Laptop part, and power limited.** This GPU hits its 60 W enforced ceiling
   during inference. The coefficient is therefore partly a property of that
   ceiling. A desktop part, or the same silicon at a different limit, will give
   a different number.
3. **Driver-reported power, +/- 5 W absolute**, with no statement from NVIDIA
   about whether the error is systematic or random.
4. **Sampling interval about 15.5 ms**, against phases as short as 0.15 s. The
   thinnest windows hold about 10 samples.
5. **Thermal state is not controlled.** The sweep runs back to back and the part
   warms up. Temperature is recorded per sample; it is not held constant.
6. **One machine, one runtime, one quantization each, batch size 1.** Nothing
   here says anything about batched serving, other quantizations, other
   runtimes, or any other device.
7. **The tail is excluded from the phase figures** and its size is published
   separately (see Method, section 4). On the 1B model it is a median 29.9 per
   cent of a request's net energy, which is not a rounding error.
8. **Per-token prefill energy here is length dependent** and is therefore not
   summarized honestly by one number. See "Why no coefficient was published".
9. **Nothing here describes hosted inference.** See the scope fence at the top.

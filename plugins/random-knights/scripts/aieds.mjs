#!/usr/bin/env node
// The `aieds` command. The same file is the plugin's hook script and, staged
// into the npm package @randomknights/aieds, its `aieds` bin.
//
//   aieds hook [claude|codex|grok|copilot]
//                                   What a host's hook calls. Reads the hook input
//                                   on stdin, prints the receipt where the host
//                                   shows it, queues it for sync if connected.
//   aieds connect | disconnect | status | flush
//                                   The optional receipts sync (off until `connect`).
//   aieds install claude|codex|copilot [--yes]
//   aieds receipt [--session <id> | --transcript <file> | --last grok]
//                 [--format rk-receipts] [--sync]
//   aieds explain                   Formulas and coefficient sources.
//
// For tools with no hook mechanism:
//   aieds ollama --model <m> [--host <url>] [--num-ctx <n>] [--stream] [--no-text] <prompt>
//   aieds chat-completion [<file>|-] [--provider <label>]
//   aieds usage --provider <label> --model <m> --input <n> --output <n> [--cached <n>]
//
// The hook mode has one hard rule: it never blocks and never crashes the host.
// Every failure path, including a failure to load the modules below, ends in
// exit code 0 with no output.
//
// NETWORK AND FILES. Until the user runs `aieds connect`, this tool makes no
// network call except the one the user asks for (`ollama` talks to the Ollama
// server the user names) and writes no file unless the user sets
// AIEDS_RECEIPT_LOG (the Copilot CLI reader also keeps a small file of read
// marks, numbers only). After `connect`, and only then, each receipt's
// allowlisted numbers go to the user's own account. See README, "Network and
// privacy".

import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    const chunks = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    // A hook always closes stdin. This only guards a stray manual run.
    setTimeout(finish, 3000).unref();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

/**
 * True when the session file already holds the model call this Stop belongs
 * to. Each host names the turn differently, so each gets its own check:
 *
 *   Claude Code  the last assistant text equals last_assistant_message
 *   Codex        a token_count record exists for the hook's turn_id
 *   Grok Build   a turn_completed record exists for the hook's promptId
 *
 * A host whose input names no turn is treated as settled.
 */
function isSettled(parsed, input) {
  if (parsed.host === "unknown") return true;
  if (parsed.host === "codex") {
    const id = input.turn_id ?? input.turnId;
    return typeof id !== "string" || parsed.calls.some((c) => c.turnId === id);
  }
  if (parsed.host === "grok") {
    const id = input.promptId ?? input.prompt_id;
    return (
      typeof id !== "string" ||
      parsed.calls.some((c) => c.id.startsWith(`${id}:`))
    );
  }
  const last = input.last_assistant_message ?? input.lastAssistantMessage;
  if (typeof last !== "string" || normalize(last).length === 0) return true;
  return normalize(parsed.lastAssistantText) === normalize(last);
}

/**
 * The session file can lag the live conversation at Stop time (Claude Code's
 * hooks reference says so). Wait briefly until it holds this turn, so the
 * receipt includes the last model call. Bounded: it gives up quietly and uses
 * what is there.
 */
async function readSettledTranscript(core, path, input) {
  let parsed = core.readTranscript(path);
  for (let i = 0; i < 20; i += 1) {
    if (isSettled(parsed, input)) return parsed;
    await sleep(100);
    parsed = core.readTranscript(path);
  }
  return parsed;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * The session id a host's own hook reports, recovered from the session file's
 * path, so a receipt built from a hook and the same one built later from the
 * file get the SAME rid (and sync counts them once).
 */
export function sessionIdFromPath(path) {
  const name = basename(String(path));
  if (name === "updates.jsonl") return basename(dirname(String(path)));
  const m = name.match(UUID);
  if (m) return m[0];
  return name.replace(/\.[^.]+$/, "");
}

function hostOf(parsed) {
  return ["claude", "codex", "grok"].includes(parsed.host) ? parsed.host : "other";
}

/** Lazy imports, so the hook path loads only what it needs. */
async function loadSync() {
  const [receipts, flow] = await Promise.all([import("./receipts.mjs"), import("./syncflow.mjs")]);
  return { receipts, flow };
}

function appendLog(core, receiptsMod, entries, receipt, sessionId, env) {
  const logPath = env.AIEDS_RECEIPT_LOG;
  if (typeof logPath !== "string" || logPath.length === 0) return;
  try {
    const rk = String(env.AIEDS_RECEIPT_LOG_FORMAT ?? "").trim().toLowerCase() === "rk-receipts";
    const text = rk
      ? entries.map((e) => receiptsMod.receiptLogLine(e.receipt)).join("\n")
      : core.logLine(sessionId, receipt);
    if (text.length > 0) appendFileSync(core.expandHome(logPath), `${text}\n`);
  } catch {
    // The log is a convenience. A failure here must not surface.
  }
}

async function runHook(hostArg, env = process.env) {
  const core = await import("./core.mjs");
  if (!core.receiptsEnabled(env)) return;
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  if (input === null || typeof input !== "object") return;

  if (hostArg === "copilot") {
    await runCopilotHook(core, input, env);
    return;
  }

  // Claude Code and Codex send transcript_path. Grok Build sends both spellings.
  const transcriptPath = input.transcript_path ?? input.transcriptPath;
  if (typeof transcriptPath !== "string") return;
  // Grok also fires Stop once more at session end, with reason "shutdown" or
  // "channel_closed". That is not a response, so it gets no receipt.
  if (typeof input.reason === "string" && input.reason !== "end_turn") return;

  const parsed = await readSettledTranscript(core, transcriptPath, input);
  if (parsed.calls.length === 0) return;
  // Codex and Grok name the turn in the hook input. If the session file still
  // lacks that turn after the bounded wait, the newest record in it belongs to
  // an earlier response, and a receipt labeled "this response" would be wrong.
  // Say nothing rather than mislabel.
  if (
    (parsed.host === "codex" || parsed.host === "grok") &&
    !isSettled(parsed, input)
  ) {
    return;
  }

  const receipt = core.receiptFor(parsed);
  process.stdout.write(
    JSON.stringify({ systemMessage: core.formatReceipt(receipt) }) + "\n",
  );

  // After the receipt is out: the optional log and the optional sync. Both are
  // best effort and bounded; neither can change what the host already showed.
  const sessionId = input.session_id ?? input.sessionId ?? sessionIdFromPath(transcriptPath);
  const wantsLog = typeof env.AIEDS_RECEIPT_LOG === "string" && env.AIEDS_RECEIPT_LOG.length > 0;
  try {
    const { receipts, flow } = await loadSync();
    const active = flow.syncActive(env);
    let entries = [];
    if (wantsLog || active) {
      entries = receipts.receiptsFromParsed(parsed, {
        host: hostOf(parsed),
        sessionId,
        tsMs: Date.now(),
      });
    }
    if (wantsLog) appendLog(core, receipts, entries, receipt, sessionId, env);
    if (active) await flow.queueAndFlush(entries, { env });
  } catch {
    // never into the host
  }
}

/**
 * Copilot CLI agentStop. The payload names the session's event file
 * (transcriptPath). Only the usage records appended since the last turn are
 * read, as numbers; see hosts/copilot.mjs for exactly what is and is not read.
 */
async function runCopilotHook(core, input, env) {
  const copilot = await import("./hosts/copilot.mjs");
  const sessionId = input.sessionId ?? input.session_id;
  if (!copilot.isSafeCopilotSessionId(sessionId)) return;
  const path = input.transcriptPath ?? input.transcript_path ?? copilot.copilotEventsPath(sessionId, env);
  if (!copilot.isCopilotEventsPath(path)) return;

  const { receipts, flow } = await loadSync();
  const store = await import("./store.mjs");
  const key = receipts.shortHash(sessionId);
  const marks = store.loadMarks(env);
  const read = copilot.readCopilotUsage(path, marks[key]?.pos ?? 0);
  marks[key] = { pos: read.nextPos, seenAtMs: Date.now() };
  try {
    store.saveMarks(marks, env);
  } catch {
    // Without the read-position file the next turn may re-read; rids keep that safe.
  }
  if (read.calls.length === 0) return;

  const first = read.calls[0].id;
  const last = read.calls[read.calls.length - 1].id;
  const tsMs = receipts.tsOfCalls(read.calls, Date.now());
  const entries = receipts.receiptsFromCalls(read.calls, {
    host: "copilot",
    sessionId,
    turnKey: `${first}..${last}`,
    tsMs,
  });

  process.stdout.write(`${core.formatResponseReceipt(core.disclose(read.calls))}\n`);

  const wantsLog = typeof env.AIEDS_RECEIPT_LOG === "string" && env.AIEDS_RECEIPT_LOG.length > 0;
  try {
    if (wantsLog) appendLog(core, receipts, entries, undefined, sessionId, env);
    if (flow.syncActive(env)) await flow.queueAndFlush(entries, { env });
  } catch {
    // never into the host
  }
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

async function runReceipt(args, env = process.env) {
  const core = await import("./core.mjs");
  const hosts = await import("./hosts.mjs");
  let path = argValue(args, "--transcript");
  const last = argValue(args, "--last");
  if (path === undefined && last !== undefined) {
    if (last !== "grok") {
      console.log("--last supports grok today (the newest Grok Build session). For other tools use --session or --transcript.");
      return;
    }
    path = hosts.findNewestGrokSession(env);
    if (path === undefined) {
      console.log("No Grok Build session was found under GROK_HOME or ~/.grok/sessions, so no receipt can be built.");
      return;
    }
  }
  if (path === undefined) {
    const session = argValue(args, "--session");
    if (!core.isSafeSessionId(session)) {
      console.log(
        "No session id was provided, so no receipt can be built. " +
          "Run /random-knights:aieds inside a Claude Code session, or pass --transcript <file> or --last grok.",
      );
      return;
    }
    path = core.findTranscript(session);
    if (path === undefined) {
      path = hosts.findHostSession(session);
    }
    if (path === undefined) {
      console.log(
        "No transcript was found for this session yet, so no receipt can be built. " +
          "Receipts start after the first response.",
      );
      return;
    }
  }
  let parsed;
  try {
    parsed = core.readTranscript(path);
  } catch {
    console.log("The transcript could not be read, so no receipt can be built.");
    return;
  }
  if (parsed.calls.length === 0) {
    console.log("The transcript has no model calls yet, so there is nothing to total.");
    return;
  }

  const format = argValue(args, "--format");
  const wantsSync = args.includes("--sync");
  if (format === "rk-receipts" || wantsSync) {
    const { receipts, flow } = await loadSync();
    const entries = receipts.receiptsFromParsed(
      parsed,
      { host: hostOf(parsed), sessionId: sessionIdFromPath(path), tsMs: Date.now(), useRecordTime: true },
      { all: true },
    );
    if (format === "rk-receipts") {
      for (const e of entries) console.log(receipts.receiptLogLine(e.receipt));
    } else {
      console.log(core.formatSessionReceipt(core.receiptFor(parsed).session));
    }
    if (wantsSync) {
      if (!flow.syncActive(env)) {
        console.error("Not connected, so nothing was queued. Run `aieds connect` first.");
      } else {
        const r = await flow.queueAndFlush(entries, { env, budgetMs: 15_000 });
        console.error(`Queued ${r.queued} receipt(s) (${r.invalid} failed the local check). Sync: ${r.flush?.state ?? "n/a"}.`);
      }
    }
    return;
  }
  console.log(core.formatSessionReceipt(core.receiptFor(parsed).session));
}

function intArg(args, flag) {
  const v = argValue(args, flag);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

/** Queues one wrapper response for sync when connected. Silent and bounded. */
async function syncWrapperCall(host, call, env) {
  try {
    const { flow } = await loadSync();
    if (!flow.syncActive(env)) return;
    await flow.queueAndFlush(flow.wrapperEntries({ host, call }), { env, budgetMs: 4000 });
  } catch {
    // sync never breaks a command
  }
}

async function runOllama(args, env = process.env) {
  const wrappers = await import("./wrappers.mjs");
  const model = argValue(args, "--model") ?? env.OLLAMA_MODEL;
  const host = argValue(args, "--host") ?? env.OLLAMA_HOST;
  const numCtx = intArg(args, "--num-ctx");
  const noText = args.includes("--no-text");
  const stream = args.includes("--stream");
  // The prompt is everything that is not a flag or a flag's value.
  const valued = new Set(["--model", "--host", "--num-ctx"]);
  const words = [];
  for (let i = 0; i < args.length; i += 1) {
    if (valued.has(args[i])) {
      i += 1;
    } else if (!args[i].startsWith("--")) {
      words.push(args[i]);
    }
  }
  let prompt = words.join(" ");
  if (prompt === "-" || (prompt.length === 0 && !process.stdin.isTTY)) {
    prompt = (await readAll(process.stdin)).trim();
  }
  if (typeof model !== "string" || model.length === 0 || prompt.length === 0) {
    console.error(
      "usage: aieds ollama --model <name> [--host <url>] [--num-ctx <n>] [--stream] [--no-text] <prompt>",
    );
    process.exitCode = 2;
    return;
  }
  if (Number.isNaN(numCtx)) {
    console.error("--num-ctx must be a whole number");
    process.exitCode = 2;
    return;
  }
  try {
    const onText = stream && !noText ? (piece) => process.stdout.write(piece) : undefined;
    const r = await wrappers.ollamaChat({ host, model, prompt, numCtx, stream, onText });
    if (stream) {
      if (!noText) process.stdout.write("\n\n");
    } else if (!noText) {
      console.log(`${r.text}\n`);
    }
    console.log(r.receipt);
    await syncWrapperCall("ollama", wrappers.callFromUsage(r.usage), env);
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exitCode = 1;
  }
}

async function runChatCompletion(args, env = process.env) {
  const wrappers = await import("./wrappers.mjs");
  const provider = argValue(args, "--provider") ?? "OpenAI-compatible";
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--provider",
  );
  const source = positional[0] ?? "-";
  let text;
  try {
    text = source === "-" ? await readAll(process.stdin) : readFileSync(source, "utf8");
  } catch {
    console.error("The response could not be read.");
    process.exitCode = 1;
    return;
  }
  // A whole JSON response, or a streamed one (server-sent events or
  // newline-delimited JSON): the last chunk that carries counters wins.
  const usage = wrappers.usageFromStream(text);
  if (usage === undefined) {
    console.error(
      "The response has no usage block with prompt and completion token counts, so no receipt can be built. " +
        "For a streamed OpenAI-compatible response, ask for stream_options.include_usage.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(wrappers.receiptTextFromUsage({ provider, ...usage }));
  await syncWrapperCall("other", wrappers.callFromUsage({ provider, ...usage }), env);
}

async function runUsage(args, env = process.env) {
  const wrappers = await import("./wrappers.mjs");
  const provider = argValue(args, "--provider") ?? "Other";
  const model = argValue(args, "--model");
  const input = intArg(args, "--input");
  const output = intArg(args, "--output");
  const cached = intArg(args, "--cached") ?? 0;
  if (
    typeof model !== "string" ||
    input === undefined ||
    output === undefined ||
    [input, output, cached].some((n) => Number.isNaN(n))
  ) {
    console.error(
      "usage: aieds usage --provider <label> --model <id> --input <n> --output <n> [--cached <n>]",
    );
    process.exitCode = 2;
    return;
  }
  const usage = {
    provider,
    model,
    inputTokens: input,
    outputTokens: output,
    cachedTokens: cached,
  };
  console.log(wrappers.receiptTextFromUsage(usage));
  await syncWrapperCall("other", wrappers.callFromUsage(usage), env);
}

const USAGE =
  "usage: aieds hook [host] | connect | disconnect | status | flush | install <host> | " +
  "receipt [--session <id> | --transcript <file> | --last grok] | explain | " +
  "ollama | chat-completion | usage";

/** The file the user ran (the bin, or the plugin script), symlinks resolved. */
function entryPath() {
  try {
    return process.argv[1] ? realpathSync(process.argv[1]) : "";
  } catch {
    return process.argv[1] ?? "";
  }
}

function commandIo(env) {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    env,
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    scriptPath: entryPath(),
  };
}

export async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const env = process.env;
  if (mode === "hook") {
    // Hook mode never fails loudly: any error ends as exit 0 with no output.
    process.on("uncaughtException", () => process.exit(0));
    process.on("unhandledRejection", () => process.exit(0));
    try {
      await runHook(rest.find((a) => !a.startsWith("--")), env);
    } catch {
      // Swallow everything. A receipt is never worth breaking a session.
    }
    // Let the event loop drain instead of calling process.exit(): on a pipe a
    // forced exit can drop the JSON that was just written to stdout.
    process.exitCode = 0;
    return;
  }
  if (mode === "receipt") {
    await runReceipt(rest, env);
    return;
  }
  if (mode === "ollama") {
    await runOllama(rest, env);
    return;
  }
  if (mode === "chat-completion") {
    await runChatCompletion(rest, env);
    return;
  }
  if (mode === "usage") {
    await runUsage(rest, env);
    return;
  }
  if (mode === "explain") {
    const core = await import("./core.mjs");
    console.log(core.formatExplanation());
    return;
  }
  if (mode === "connect" || mode === "disconnect" || mode === "status" || mode === "flush") {
    const c = await import("./connect.mjs");
    const run = { connect: c.runConnect, disconnect: c.runDisconnect, status: c.runStatus, flush: c.runFlush }[mode];
    process.exitCode = await run(rest, commandIo(env));
    return;
  }
  if (mode === "install") {
    const i = await import("./install.mjs");
    process.exitCode = i.runInstall(rest, commandIo(env));
    return;
  }
  if (mode === "--version" || mode === "-v" || mode === "version") {
    const s = await import("./syncclient.mjs");
    console.log(s.CLIENT_VERSION);
    return;
  }
  console.log(USAGE);
  if (mode !== undefined && mode !== "--help" && mode !== "-h" && mode !== "help") process.exitCode = 2;
}

// Run only when this file is the one executed (the plugin hook). The npm bin
// imports main() and calls it, so importing this module never runs a command.
if (entryPath() === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  });
}

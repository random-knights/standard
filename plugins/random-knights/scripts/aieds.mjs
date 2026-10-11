#!/usr/bin/env node
// Entry point for the Random Knights AiEDs plugin.
//
//   aieds.mjs hook                      Stop hook: reads the hook input on stdin,
//                                       prints {"systemMessage": "..."} or nothing.
//   aieds.mjs receipt --session <id>    Session total, found under the Claude, Codex
//                                       or Grok Build session directories.
//   aieds.mjs receipt --transcript <p>  Session total for one session file.
//   aieds.mjs explain                   Formulas and coefficient sources.
//
// For tools with no hook mechanism (a wrapper, not a plugin install):
//   aieds.mjs ollama --model <m> [--host <url>] [--num-ctx <n>] [--no-text] <prompt>
//   aieds.mjs chat-completion [<file>|-] [--provider <label>]
//   aieds.mjs usage --provider <label> --model <m> --input <n> --output <n> [--cached <n>]
//
// The hook mode has one hard rule: it never blocks and never crashes Claude
// Code. Every failure path, including a failure to load the modules below,
// ends in exit code 0 with no output. There is no network access, no
// telemetry, and no file is written unless the user sets AIEDS_RECEIPT_LOG to
// a path.

import { appendFileSync, readFileSync } from "node:fs";

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

async function runHook() {
  const core = await import("./core.mjs");
  if (!core.receiptsEnabled()) return;
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  if (input === null || typeof input !== "object") return;
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

  const logPath = process.env.AIEDS_RECEIPT_LOG;
  if (typeof logPath === "string" && logPath.length > 0) {
    try {
      appendFileSync(
        core.expandHome(logPath),
        core.logLine(input.session_id ?? input.sessionId, receipt) + "\n",
      );
    } catch {
      // The log is a convenience. A failure here must not surface.
    }
  }
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

async function runReceipt(args) {
  const core = await import("./core.mjs");
  let path = argValue(args, "--transcript");
  if (path === undefined) {
    const session = argValue(args, "--session");
    if (!core.isSafeSessionId(session)) {
      console.log(
        "No session id was provided, so no receipt can be built. " +
          "Run /random-knights:aieds inside a Claude Code session, or pass --transcript <file>.",
      );
      return;
    }
    path = core.findTranscript(session);
    if (path === undefined) {
      const hosts = await import("./hosts.mjs");
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

async function runOllama(args) {
  const wrappers = await import("./wrappers.mjs");
  const model = argValue(args, "--model") ?? process.env.OLLAMA_MODEL;
  const host = argValue(args, "--host") ?? process.env.OLLAMA_HOST;
  const numCtx = intArg(args, "--num-ctx");
  const noText = args.includes("--no-text");
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
      "usage: aieds.mjs ollama --model <name> [--host <url>] [--num-ctx <n>] [--no-text] <prompt>",
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
    const r = await wrappers.ollamaChat({ host, model, prompt, numCtx });
    if (!noText) console.log(`${r.text}\n`);
    console.log(r.receipt);
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exitCode = 1;
  }
}

async function runChatCompletion(args) {
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
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("The input is not JSON.");
    process.exitCode = 1;
    return;
  }
  const usage = wrappers.usageFromChatCompletion(json);
  if (usage === undefined) {
    console.error(
      "The response has no usage block with prompt and completion token counts, so no receipt can be built.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(wrappers.receiptTextFromUsage({ provider, ...usage }));
}

async function runUsage(args) {
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
      "usage: aieds.mjs usage --provider <label> --model <id> --input <n> --output <n> [--cached <n>]",
    );
    process.exitCode = 2;
    return;
  }
  console.log(
    wrappers.receiptTextFromUsage({
      provider,
      model,
      inputTokens: input,
      outputTokens: output,
      cachedTokens: cached,
    }),
  );
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "hook") {
    // Hook mode never fails loudly: any error ends as exit 0 with no output.
    process.on("uncaughtException", () => process.exit(0));
    process.on("unhandledRejection", () => process.exit(0));
    try {
      await runHook();
    } catch {
      // Swallow everything. A receipt is never worth breaking a session.
    }
    // Let the event loop drain instead of calling process.exit(): on a pipe a
    // forced exit can drop the JSON that was just written to stdout.
    process.exitCode = 0;
    return;
  }
  if (mode === "receipt") {
    await runReceipt(rest);
    return;
  }
  if (mode === "ollama") {
    await runOllama(rest);
    return;
  }
  if (mode === "chat-completion") {
    await runChatCompletion(rest);
    return;
  }
  if (mode === "usage") {
    await runUsage(rest);
    return;
  }
  if (mode === "explain") {
    const core = await import("./core.mjs");
    console.log(core.formatExplanation());
    return;
  }
  console.log(
    "usage: aieds.mjs hook | receipt [--session <id> | --transcript <file>] | explain | " +
      "ollama | chat-completion | usage",
  );
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
});

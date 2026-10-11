#!/usr/bin/env node
// Entry point for the Random Knights AiEDs plugin.
//
//   aieds.mjs hook                      Stop hook: reads the hook input on stdin,
//                                       prints {"systemMessage": "..."} or nothing.
//   aieds.mjs receipt --session <id>    Session total, found under the Claude or
//                                       Grok Build session directories.
//   aieds.mjs receipt --transcript <p>  Session total for one session file.
//   aieds.mjs explain                   Formulas and coefficient sources.
//
// The hook mode has one hard rule: it never blocks and never crashes Claude
// Code. Every failure path, including a failure to load the modules below,
// ends in exit code 0 with no output. There is no network access, no
// telemetry, and no file is written unless the user sets AIEDS_RECEIPT_LOG to
// a path.

import { appendFileSync } from "node:fs";

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
 *   Grok Build   a turn_completed record exists for the hook's promptId
 *
 * A host whose input names no turn is treated as settled.
 */
function isSettled(parsed, input) {
  if (parsed.host === "unknown") return true;
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
  // Claude Code sends transcript_path. Grok Build sends both spellings.
  const transcriptPath = input.transcript_path ?? input.transcriptPath;
  if (typeof transcriptPath !== "string") return;
  // Grok also fires Stop once more at session end, with reason "shutdown" or
  // "channel_closed". That is not a response, so it gets no receipt.
  if (typeof input.reason === "string" && input.reason !== "end_turn") return;

  const parsed = await readSettledTranscript(core, transcriptPath, input);
  if (parsed.calls.length === 0) return;
  // Grok names the turn in the hook input. If the session file still
  // lacks that turn after the bounded wait, the newest record in it belongs to
  // an earlier response, and a receipt labeled "this response" would be wrong.
  // Say nothing rather than mislabel.
  if (
    parsed.host === "grok" && !isSettled(parsed, input)
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
  if (mode === "explain") {
    const core = await import("./core.mjs");
    console.log(core.formatExplanation());
    return;
  }
  console.log(
    "usage: aieds.mjs hook | receipt [--session <id> | --transcript <file>] | explain",
  );
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
});

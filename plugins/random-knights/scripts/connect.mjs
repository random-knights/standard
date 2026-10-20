// `aieds connect | disconnect | status | flush`: the user-facing side of the
// optional receipts sync (SYNC-SPEC sections 3, 8.1 and 11).
//
// Nothing here runs unless the user types it. `connect` prints the consent
// text FIRST, then asks the server for a one-time code, prints the link, and
// waits while the user approves it in the browser, signed in to their own
// account. The per-device token that comes back is stored with mode 0600 and is
// never printed.

import { spawn } from "node:child_process";
import { hostname, platform } from "node:os";
import { createInterface } from "node:readline";

import {
  clearConnection,
  loadConnection,
  loadState,
  paths,
  readQueue,
  saveConnection,
  saveState,
  syncDisabled,
} from "./store.mjs";
import {
  CLIENT_VERSION,
  DEFAULT_ENDPOINT,
  endpointProblem,
  flushQueue,
  pollDevice,
  revokeSelf,
  startDevice,
} from "./syncclient.mjs";
import { RECEIPT_FIELD_NAMES } from "./receipts.mjs";

/** SYNC-SPEC 8.1, printed before the link is shown or opened. Plain words. */
export const CONSENT_TEXT = [
  "Connect this device to your Random Knights account?",
  "If you approve, after each AI response on this device we send us five kinds of numbers: when it happened, the model name, how many tokens went in and out, and the energy, carbon, water and tree-time we estimated from them. We also send the name of the tool (for example claude-code) and a random id so the same response is never counted twice.",
  "We never send your prompts, the replies, file names, folder names, project names, API keys or your computer's name (unless you typed a device label).",
  "We use the numbers to fill your reports. You can disconnect this device any time on knightly.engineering/reports, and you can delete everything we received. You must be 13 or older.",
].join("\n\n");

const LABEL_RE = /^[A-Za-z0-9 ._()-]{1,60}$/;

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

/** A label of the allowed characters only, at most 60 of them. */
export function cleanLabel(text) {
  const s = String(text ?? "")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return s.length > 0 ? s : "";
}

export function defaultLabel(env = process.env) {
  void env;
  return cleanLabel(`${hostname()} (${platform()})`) || `${platform()} device`;
}

function ask(question, io) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: io.stdin, output: io.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    rl.on("close", () => resolve(""));
  });
}

function openUrl(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const [cmd, args] =
      process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `aieds connect [--label <text>] [--endpoint <url>] [--open] [--force]`.
 * `io` = { stdout, stderr, stdin, env, fetchImpl, sleepImpl, isTTY }.
 * Returns the exit code.
 */
export async function runConnect(args, io) {
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const sleepImpl = io.sleepImpl ?? sleep;

  if (syncDisabled(env)) {
    out("AIEDS_SYNC is off, so nothing will be connected. Unset it to connect.");
    return 1;
  }
  const existing = loadConnection(env);
  if (existing !== undefined && !args.includes("--force")) {
    out(`This device is already connected (device ${existing.deviceId || "unknown"}).`);
    out("Run `aieds disconnect` first if you want to link it again.");
    return 0;
  }

  const endpoint = (argValue(args, "--endpoint") ?? env.AIEDS_SYNC_ENDPOINT ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const bad = endpointProblem(endpoint);
  if (bad !== null) {
    out(bad);
    return 2;
  }

  // The consent text comes BEFORE any network call and before any link.
  out(CONSENT_TEXT);
  out("");

  let label = argValue(args, "--label");
  if (label !== undefined) {
    label = cleanLabel(label);
  } else if (io.isTTY) {
    const suggested = defaultLabel(env);
    const typed = await ask(`Device label shown on your reports page [${suggested}]: `, io);
    label = cleanLabel(typed) || suggested;
  } else {
    // No terminal to edit it in: a hostname can be personal, so use a generic label.
    label = `${platform()} device`;
  }
  if (!LABEL_RE.test(label)) label = `${platform()} device`;

  const started = await startDevice({ endpoint, label, fetchImpl: io.fetchImpl });
  if (started.status !== 200 || typeof started.body.deviceCode !== "string") {
    out(
      started.status === 0
        ? "Could not reach the sign-in service. Check your connection and try again."
        : started.status === 503
          ? "Receipts sync is paused right now. Try again later."
          : `The sign-in service refused the request (${String(started.body.error ?? started.status).slice(0, 40)}).`,
    );
    return 1;
  }
  const b = started.body;
  const link = String(b.verificationUriComplete ?? b.verificationUri ?? "");
  out(`Open this link while signed in at Random Knights, then press Approve:`);
  out(`  ${link}`);
  out(`Code: ${String(b.userCode ?? "")}   (valid ${Math.round(Number(b.expiresInSec ?? 600) / 60)} minutes)`);
  if (args.includes("--open")) {
    if (!openUrl(link)) out("Could not open a browser. Open the link yourself.");
  }
  out("Waiting for you to approve...");

  let intervalMs = Math.max(200, Number(b.intervalSec ?? 5) * 1000);
  const deadline = Date.now() + Math.max(1, Number(b.expiresInSec ?? 600)) * 1000;
  while (Date.now() < deadline) {
    await sleepImpl(intervalMs);
    const r = await pollDevice({ endpoint, deviceCode: b.deviceCode, fetchImpl: io.fetchImpl });
    const status = r.body.status;
    if (r.status === 200 && status === "approved" && typeof r.body.token === "string") {
      saveConnection(
        {
          endpoint,
          token: r.body.token,
          deviceId: typeof r.body.deviceId === "string" ? r.body.deviceId : "",
          connectedAt: new Date().toISOString(),
        },
        env,
      );
      saveState({ ...loadState(env), failures: 0, nextAttemptAtMs: 0, notice: "", lastError: "" }, env);
      out(`Connected. Device label: ${label}.`);
      out("Receipts from this device now go to your account, after each response.");
      out("Stop any time: aieds disconnect   (or set AIEDS_SYNC=off for one run).");
      return 0;
    }
    if (status === "denied") {
      out("The request was denied. Nothing was connected.");
      return 1;
    }
    if (status === "expired") {
      out("The code expired. Run `aieds connect` again.");
      return 1;
    }
    if (r.status === 429 || status === "slow_down") {
      intervalMs += 5000;
    }
  }
  out("Timed out waiting for approval. Run `aieds connect` again.");
  return 1;
}

/** `aieds disconnect`: revoke this device's token, then delete the token file and the queue. */
export async function runDisconnect(args, io) {
  void args;
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const conn = loadConnection(env);
  if (conn === undefined) {
    out("This device is not connected.");
    return 0;
  }
  let revoked = false;
  if (endpointProblem(conn.endpoint) === null) {
    const r = await revokeSelf({ endpoint: conn.endpoint, token: conn.token, fetchImpl: io.fetchImpl });
    revoked = r.status === 200 || r.status === 401;
  }
  const queued = readQueue(env).length;
  clearConnection(env);
  out(revoked ? "Disconnected. This device's token was revoked and deleted." : "Disconnected on this device. The token file is deleted.");
  if (!revoked) {
    out("The server could not be reached, so the token may still be listed on knightly.engineering/reports. Revoke it there.");
  }
  if (queued > 0) out(`${queued} queued receipt(s) were deleted without being sent.`);
  out("Run `aieds connect` to link again.");
  return 0;
}

function ago(ms, nowMs) {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (s < 90) return `${s} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const NOTICES = {
  disconnected_by_server: "This device was disconnected from your account (the token was revoked). Run `aieds connect` to link again.",
  update_needed: "The server asked for a newer client. Update with: npm i -g @randomknights/aieds (or rerun npx).",
};

/** `aieds status`: never prints the token. */
export async function runStatus(args, io) {
  void args;
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const nowMs = io.nowMs ?? Date.now();
  const conn = loadConnection(env);
  const state = loadState(env);
  out(`aieds ${CLIENT_VERSION}`);
  if (syncDisabled(env)) out("Sync: switched off for this process (AIEDS_SYNC).");
  if (conn === undefined) {
    out("Sync: not connected. Nothing leaves this computer. Run `aieds connect` to send receipts to your own account.");
  } else {
    out(`Sync: connected (device ${conn.deviceId || "unknown"}, since ${conn.connectedAt || "unknown"}).`);
    out(`Endpoint: ${conn.endpoint}`);
    out(`Queued, not yet sent: ${readQueue(env).length} (limit ${conn.queueMax})`);
    out(`Sent: ${state.sent}, duplicates: ${state.duplicates}, rejected: ${state.rejected}, dropped: ${state.dropped}`);
    out(`Last send: ${ago(state.lastSentAtMs, nowMs)}`);
    if (state.nextAttemptAtMs > nowMs) {
      out(`Next attempt in ${Math.ceil((state.nextAttemptAtMs - nowMs) / 1000)} s (last problem: ${state.lastError || "unknown"}).`);
    } else if (state.lastError) {
      out(`Last problem: ${state.lastError}`);
    }
    out(`Token file: ${paths(env).sync} (the token is never printed)`);
  }
  if (state.notice && NOTICES[state.notice]) out(NOTICES[state.notice]);
  out(`What is sent per response: ${RECEIPT_FIELD_NAMES.join(", ")}.`);
  return 0;
}

/** `aieds flush`: send the queue now (ignores the retry timer). */
export async function runFlush(args, io) {
  void args;
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const r = await flushQueue({ env, fetchImpl: io.fetchImpl, budgetMs: 15_000, force: true });
  switch (r.state) {
    case "not-connected":
      out("Not connected, so nothing is sent. Run `aieds connect` first.");
      return 0;
    case "off":
      out("AIEDS_SYNC is off, so nothing is sent.");
      return 0;
    case "empty":
      out("Nothing is waiting to be sent.");
      return 0;
    case "busy":
      out("Another flush is running. Try again in a moment.");
      return 0;
    case "revoked":
      out("This device was disconnected from your account. Run `aieds connect` to link again.");
      return 1;
    case "blocked":
      out("The saved endpoint is not allowed (it must be https). Nothing was sent.");
      return 1;
    default:
      out(
        `Sent ${r.sent} (duplicates ${r.duplicates}, rejected ${r.rejected}, dropped ${r.dropped}). Still queued: ${r.kept}.` +
          (r.state === "retry" ? ` Will retry later (${r.error ?? "waiting"}).` : ""),
      );
      return r.state === "retry" && r.kept > 0 ? 1 : 0;
  }
}

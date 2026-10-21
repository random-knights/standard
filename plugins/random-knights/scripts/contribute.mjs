// `aieds contribute on | off | status | preview | submit | delete`: the
// user-facing side of the opt-in community contribution (CONTRIBUTE-SPEC
// section 4). Default OFF. Nothing here runs unless the user types it, and
// `on` prints the approved consent text exactly, then asks [y/N], BEFORE any
// network call or link. The per-device token (rkc_...) is stored with mode 0600
// in contribute.json, a file of its own, and is never printed.

import { platform } from "node:os";

import { ask, openUrl } from "./connect.mjs";
import {
  CONSENT_VERSION,
  callApi,
  chooseEndpoint,
  buildUploads,
  clearContribute,
  clearContributeQueue,
  consentText,
  contributeDisabled,
  loadCState,
  loadContribute,
  plainProblem,
  queueSummary,
  readCQueue,
  saveContribute,
  submitQueue,
} from "./contributeflow.mjs";
import { paths } from "./store.mjs";
import { CLIENT_NAME, CLIENT_VERSION, endpointProblem } from "./syncclient.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const HELP = [
  "usage: aieds contribute <command>",
  "",
  "  on [--staging] [--open]     Read the consent text, answer y/N, then sign in.",
  "                              Contributing is OFF until you do this.",
  "  status                      Whether it is on, what waits, what was last sent.",
  "  preview [--pretty]          Print the exact JSON the next upload would send.",
  "          [--transcript <file> | --session <id>]",
  "                              Look at real numbers before deciding (works when off).",
  "  submit                      Send closed days now. When on, a hook does this once a day.",
  "  delete [--forget] [--yes]   Remove your numbers not yet added into a monthly total.",
  "                              --forget also deletes the consent record (and turns it off).",
  "  off [--delete]              Stop sending, tell the service, remove the token.",
  "",
  "Order when you want both: delete first, then off. `off` removes the token that",
  "`delete` needs, so `aieds contribute off --delete` runs delete, then off.",
  "",
  "AIEDS_CONTRIBUTE=off blocks every network call. AIEDS_COMMUNITY_URL or --staging",
  "choose the service when you turn it on (production is the default).",
].join("\n");

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function yes(answer) {
  return /^(y|yes)$/i.test(String(answer ?? "").trim());
}

function ago(iso) {
  return iso ? iso.slice(0, 10) : "unknown";
}

/** `io` = { stdout, stderr, stdin, env, fetchImpl, sleepImpl, isTTY, nowMs }. Returns the exit code. */
export async function runContribute(args, io) {
  const [sub, ...rest] = args;
  switch (sub) {
    case "on":
      return runOn(rest, io);
    case "off":
      return runOff(rest, io);
    case "status":
      return runStatus(rest, io);
    case "preview":
      return runPreview(rest, io);
    case "submit":
    case "sync":
      return runSubmit(rest, io);
    case "delete":
      return runDelete(rest, io);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      io.stdout.write(`${HELP}\n`);
      return sub === undefined ? 2 : 0;
    default:
      io.stderr.write(`Unknown command: contribute ${String(sub).slice(0, 20).replace(/[^\x20-\x7e]/g, "?")}\n${HELP}\n`);
      return 2;
  }
}

// -- on ---------------------------------------------------------------------------------

async function runOn(args, io) {
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const sleepImpl = io.sleepImpl ?? sleep;

  if (contributeDisabled(env)) {
    out("AIEDS_CONTRIBUTE is off, so nothing will be turned on. Unset it to turn contributing on.");
    return 1;
  }
  const existing = loadContribute(env);
  if (existing?.enabled) {
    out("Contributing is already ON.");
    return runStatus([], io, { network: false });
  }

  if (args.includes("--yes")) {
    if (!args.includes("--i-am-the-owner-of-this-machine")) {
      io.stderr.write("--yes also needs --i-am-the-owner-of-this-machine. It is for setting up your own machines, never for install scripts.\n");
      return 2;
    }
    if (String(env.CI ?? "").trim() !== "") {
      io.stderr.write("--yes is refused when CI is set. Contributing needs a person to read the text and approve it.\n");
      return 2;
    }
    if (!io.isTTY) {
      io.stderr.write("--yes is refused when the output is not a terminal.\n");
      return 2;
    }
  } else if (!io.isTTY) {
    io.stderr.write("Run this in a terminal, or use --yes on your own machine.\n");
    return 2;
  }

  const endpoint = chooseEndpoint(args, env);
  const bad = endpointProblem(endpoint);
  if (bad !== null) {
    out(bad);
    return 2;
  }

  let text;
  try {
    text = consentText();
  } catch (e) {
    out(String(e && e.message ? e.message : e));
    return 1;
  }
  // The approved text, byte for byte, before any network call and before any link.
  io.stdout.write(text);
  if (args.includes("--yes")) {
    out("--yes: the question above is answered yes on this machine's owner's behalf. The browser approval is still needed.");
  } else {
    const answer = await ask("", io);
    if (!yes(answer)) {
      out("Not turned on.");
      return 0;
    }
  }

  const started = await callApi(
    "communityDeviceStart",
    { client: CLIENT_NAME, clientVersion: CLIENT_VERSION, deviceLabel: `${platform()} device` },
    { endpoint, env, fetchImpl: io.fetchImpl, sleepImpl },
  );
  if (started.status !== 200 || typeof started.body.deviceCode !== "string") {
    out(plainProblem(started));
    return 1;
  }
  const b = started.body;
  const link = String(b.verificationUriComplete ?? b.verificationUri ?? "");
  out("Open this link while signed in at Random Knights, read the same text, then press Approve:");
  out(`  ${link}`);
  out(`Code: ${String(b.userCode ?? "")}   (valid ${Math.round(Number(b.expiresInSec ?? 600) / 60)} minutes)`);
  if (args.includes("--open")) {
    if (!openUrl(link)) out("Could not open a browser. Open the link yourself.");
  }
  out("Waiting for you to approve...");

  let intervalMs = Math.max(200, Number(b.intervalSec ?? 5) * 1000);
  const deadline = Date.now() + Math.max(1, Number(b.expiresInSec ?? 600)) * 1000;
  let misses = 0;
  while (Date.now() < deadline) {
    await sleepImpl(intervalMs);
    const r = await callApi("communityDevicePoll", { deviceCode: b.deviceCode }, {
      endpoint, env, fetchImpl: io.fetchImpl, sleepImpl, retries: 0,
    });
    const status = r.body.status;
    if (r.status === 200 && status === "approved") {
      if (typeof r.body.token !== "string" || !r.body.token.startsWith("rkc_")) {
        out("The service did not give a usable token. Nothing was turned on.");
        return 1;
      }
      saveContribute(
        {
          endpoint,
          token: r.body.token,
          enabled: true,
          consentVersion: CONSENT_VERSION,
          consentAt: new Date(io.nowMs ?? Date.now()).toISOString(),
          withdrawPending: false,
        },
        env,
      );
      out("Contributing is ON. Stop any time: aieds contribute off.");
      out("One small summary per day goes out after the day closes. See it first: aieds contribute preview.");
      return 0;
    }
    if (status === "denied") {
      out("The request was denied. Nothing was turned on.");
      return 1;
    }
    if (status === "expired") {
      out("The code expired. Run `aieds contribute on` again.");
      return 1;
    }
    if (r.status === 0 || r.status >= 500) {
      misses += 1;
      if (misses >= 3) {
        out(plainProblem(r));
        return 1;
      }
    } else if (r.status !== 200 && r.status !== 429) {
      out(plainProblem(r));
      return 1;
    } else {
      misses = 0;
    }
    if (r.status === 429 || status === "slow_down") intervalMs += 5000;
  }
  out("Timed out waiting for approval. Run `aieds contribute on` again.");
  return 1;
}

// -- status -----------------------------------------------------------------------------------

async function runStatus(args, io, { network = true } = {}) {
  void args;
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const nowMs = io.nowMs ?? Date.now();
  const conn = loadContribute(env);
  const state = loadCState(env);
  const q = queueSummary(env, nowMs);
  out(`aieds ${CLIENT_VERSION}`);
  if (contributeDisabled(env)) out("Contributing is switched off for this process (AIEDS_CONTRIBUTE).");
  if (conn === undefined) {
    out("Contributing: OFF. Nothing leaves this computer. Run `aieds contribute on` to read the consent text and decide.");
    out("Run `aieds contribute preview --session <id>` to see what a summary looks like first.");
    return 0;
  }
  if (!conn.enabled) {
    out("Contributing: OFF. Nothing more is sent from this computer.");
    if (conn.withdrawPending) out("Withdraw pending: the service was not told yet. Run `aieds contribute off` online.");
    out(`Token file: ${paths(env).contribute} (the token is never printed)`);
    return 0;
  }
  out("Contributing: ON");
  out(`Consent version ${conn.consentVersion}, given ${ago(conn.consentAt)}.`);
  out(`Service: ${conn.endpoint}`);
  out(`Last day sent: ${state.lastSentDay || "never"}`);
  out(`Waiting on this computer: ${q.responses} responses over ${q.days} day(s); ${q.readyDays} closed day(s) ready to send.`);
  if (state.lastSentBuckets > 0) {
    out(
      `Last upload (totals only): ${state.lastSentBuckets} summaries, ${state.lastSentResponses} responses, ` +
        `${state.lastSentTokensIn} tokens in, ${state.lastSentTokensOut} tokens out.`,
    );
  }
  if (state.lastError) out(`Last problem: ${state.lastError}`);
  out(`Token file: ${paths(env).contribute} (the token is never printed)`);
  out("Run `aieds contribute preview` to see the next upload.");

  if (!network) return 0;
  const res = await callApi("communityStatus", {}, { endpoint: conn.endpoint, token: conn.token, env, fetchImpl: io.fetchImpl, sleepImpl: io.sleepImpl });
  if (res.status === 200) {
    const s = res.body;
    out(
      `Service: consent ${s.consentCurrent === false ? "is out of date, run `aieds contribute on`" : "is current"}` +
        `, last upload day ${typeof s.lastSubmitDay === "string" ? s.lastSubmitDay : "none"}` +
        `, ${Number.isInteger(s.bucketsHeldThisMonth) ? s.bucketsHeldThisMonth : 0} summaries held this month.`,
    );
    return 0;
  }
  out(plainProblem(res));
  return 1;
}

// -- preview -----------------------------------------------------------------------------------

async function entriesFromSession(args, env) {
  const core = await import("./core.mjs");
  const hosts = await import("./hosts.mjs");
  const receipts = await import("./receipts.mjs");
  let path = argValue(args, "--transcript");
  if (path === undefined) {
    const session = argValue(args, "--session");
    if (!core.isSafeSessionId(session)) return { error: "That session id is not usable." };
    path = core.findTranscript(session) ?? hosts.findHostSession(session);
    if (path === undefined) return { error: "No transcript was found for that session." };
  }
  let parsed;
  try {
    parsed = core.readTranscript(path);
  } catch {
    return { error: "The transcript could not be read." };
  }
  if (parsed.calls.length === 0) return { error: "The transcript has no model calls yet." };
  const host = ["claude", "codex", "grok"].includes(parsed.host) ? parsed.host : "other";
  const list = receipts.receiptsFromParsed(
    parsed,
    { host, sessionId: path, tsMs: Date.now(), useRecordTime: true },
    { all: true },
  );
  void env;
  return {
    entries: list.map((e) => ({
      rid: e.receipt.rid,
      day: e.receipt.tsUtc.slice(0, 10),
      host: e.host,
      provider: e.receipt.provider,
      model: e.receipt.model,
      tokenSource: e.receipt.tokenSource,
      aiedsModelVersion: e.receipt.aiedsModelVersion,
      ...(typeof e.receipt.aiedsVersion === "string" ? { aiedsVersion: e.receipt.aiedsVersion } : {}),
      tokensIn: e.receipt.tokensIn,
      tokensOut: e.receipt.tokensOut,
      cacheReadTokens: e.receipt.cacheReadTokens ?? 0,
      cacheWriteTokens: e.receipt.cacheWriteTokens ?? 0,
      energyWh: e.receipt.energyWh,
      carbonG: e.receipt.carbonG,
      waterMl: e.receipt.waterMl ?? 0,
      treeTimeMin: e.receipt.treeTimeMin,
    })),
  };
}

/** Prints the exact request body on stdout (and nothing else there); notes go to stderr. Sends nothing. */
async function runPreview(args, io) {
  const err = (s) => io.stderr.write(`${s}\n`);
  const env = io.env ?? process.env;
  const nowMs = io.nowMs ?? Date.now();
  let entries;
  let includeToday = false;
  let maxAgeDays;
  if (args.includes("--transcript") || args.includes("--session")) {
    const r = await entriesFromSession(args, env);
    if (r.error) {
      err(r.error);
      return 1;
    }
    entries = r.entries;
    includeToday = true;
    maxAgeDays = Infinity;
  } else {
    entries = readCQueue(env);
  }
  const up = buildUploads(entries, { nowMs, includeToday, maxAgeDays });
  if (up.batches.length === 0) {
    if (loadContribute(env) === undefined && !includeToday) {
      err("Contributing is off, so no summaries are being kept. To look at real numbers first, run:");
      err("  aieds contribute preview --session <id>   (or --transcript <file>)");
    } else if (up.open > 0) {
      err(`Nothing is ready: ${up.open} response(s) are from today. A day is sent after it closes (UTC).`);
    } else {
      err("Nothing is waiting to be sent.");
    }
    err("Nothing was sent.");
    return 0;
  }
  const first = up.batches[0];
  io.stdout.write(args.includes("--pretty") ? `${JSON.stringify(JSON.parse(first.body), null, 2)}\n` : `${first.body}\n`);
  if (up.batches.length > 1) err(`This is batch 1 of ${up.batches.length}; the rest follow in the same shape.`);
  if (includeToday) err("This includes today. A real upload waits until the day closes (UTC).");
  else if (up.open > 0) err(`${up.open} response(s) from today wait until the day closes (UTC).`);
  if (up.withheld.responses > 0 || up.withheld.tokens > 0) {
    err(`Withheld by the daily caps: ${up.withheld.responses} responses, ${up.withheld.tokens} tokens.`);
  }
  if (up.expiredRids.size > 0) err(`${up.expiredRids.size} response(s) are older than 7 days and can no longer be sent.`);
  err("Nothing was sent.");
  return 0;
}

// -- submit ---------------------------------------------------------------------------------------

async function runSubmit(args, io) {
  void args;
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const r = await submitQueue({ env, fetchImpl: io.fetchImpl, sleepImpl: io.sleepImpl, nowMs: io.nowMs ?? Date.now() });
  switch (r.state) {
    case "off":
      out("AIEDS_CONTRIBUTE is off, so nothing is sent.");
      return 1;
    case "not-on":
      out("Contributing is OFF, so nothing is sent. Run `aieds contribute on` to decide.");
      return 0;
    case "blocked":
      out("The saved service address is not allowed (it must be https). Nothing was sent.");
      return 1;
    case "busy":
      out("Another send is running. Try again in a moment.");
      return 0;
    case "empty":
      out(r.open > 0 ? "Nothing is ready yet: today's numbers go out after the day closes (UTC)." : "Nothing is waiting to be sent.");
      return 0;
    case "revoked":
      out(plainProblem({ status: 401, body: {} }));
      return 1;
    case "done":
      out(`Sent ${r.buckets} summaries (${r.responses} responses). Rejected by the service: ${r.rejected}. Still queued: ${r.kept}.`);
      return 0;
    default:
      out(plainProblem(r.res ?? { status: r.state === "retry" ? 0 : 503, body: { error: r.state === "paused" ? "paused" : r.state === "unavailable" ? "unavailable" : "" } }));
      return 1;
  }
}

// -- delete ------------------------------------------------------------------------------------------

async function runDelete(args, io, { skipConfirm = false } = {}) {
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const conn = loadContribute(env);
  if (conn === undefined) {
    out("Not deleted. This computer has no contributing token, and the service cannot tell whose numbers to remove without one.");
    out("Delete from the signed-in page on knightly.engineering/contribute/, or run `aieds contribute on` and then `aieds contribute delete`.");
    return 1;
  }
  const forget = args.includes("--forget");
  if (contributeDisabled(env)) {
    out("AIEDS_CONTRIBUTE is off, so nothing was sent. Not deleted. Try again with it unset.");
    return 1;
  }
  if (!skipConfirm && !args.includes("--yes")) {
    out(
      forget
        ? "Delete your numbers not yet added into a monthly total, and the record that you agreed, and turn contributing off? [y/N]"
        : "Delete your numbers not yet added into a monthly total? [y/N]",
    );
    const answer = await ask("", io);
    if (!yes(answer)) {
      out("Not deleted.");
      return 0;
    }
  }
  const res = await callApi("communityDelete", forget ? { forget: true } : {}, {
    endpoint: conn.endpoint, token: conn.token, env, fetchImpl: io.fetchImpl, sleepImpl: io.sleepImpl,
  });
  if (res.status === 401) {
    out("Not deleted. This computer is no longer signed in for contributing (the token was removed). Use the signed-in page on knightly.engineering/contribute/.");
    clearContribute(env);
    return 1;
  }
  if (res.status !== 200) {
    out(res.status === 0 ? "Not deleted. Try again online." : `Not deleted. ${plainProblem(res)}`);
    return 1;
  }
  const raw = Number.isInteger(res.body.rawRowsDeleted) ? res.body.rawRowsDeleted : 0;
  const led = Number.isInteger(res.body.ledgerDeleted) ? res.body.ledgerDeleted : 0;
  out(`Deleted ${raw} daily summaries and ${led} month records that were not yet added up.`);
  out("Numbers already combined into a monthly total cannot be taken out, because the total no longer holds anything that points to you.");
  if (forget) {
    clearContribute(env);
    out("The record that you agreed was deleted too. Contributing is OFF.");
  } else {
    clearContributeQueue(env);
    out("The summaries still waiting on this computer were deleted too, so they are not sent. Contributing stays ON.");
  }
  return 0;
}

// -- off --------------------------------------------------------------------------------------------------

async function runOff(args, io) {
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const conn = loadContribute(env);
  if (conn === undefined) {
    clearContribute(env);
    out("Contributing is already OFF.");
    return 0;
  }

  let deleteFailed = false;
  if (args.includes("--delete")) {
    // Delete runs BEFORE off: withdrawing removes the token that delete needs.
    if (conn.enabled) {
      const code = await runDelete(["--yes"], io, { skipConfirm: true });
      deleteFailed = code !== 0;
    }
  }

  // Stop sending on this computer first, whatever the network does.
  saveContribute({ ...conn, enabled: false, withdrawPending: true }, env);
  clearContributeQueue(env);

  const res = await callApi("communityWithdraw", { op: "off" }, {
    endpoint: conn.endpoint, token: conn.token, env, fetchImpl: io.fetchImpl, sleepImpl: io.sleepImpl,
  });
  if (res.status === 200 || res.status === 401) {
    clearContribute(env);
    out("Contributing is OFF. Numbers already in the monthly totals cannot be taken out (see the consent text).");
    if (!args.includes("--delete")) out("Run `aieds contribute delete` to remove numbers not yet added up.");
    return deleteFailed ? 1 : 0;
  }
  out("Contributing is OFF on this computer: nothing more will be sent.");
  out(`${plainProblem(res)} Withdraw pending: run \`aieds contribute off\` again when you are online.`);
  return 1;
}

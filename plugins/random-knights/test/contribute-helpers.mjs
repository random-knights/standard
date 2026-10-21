// Shared bits for the contribute tests: an in-process io for the commands, a
// synthetic response that passes the client's local check, and a saved token.
import { Readable } from "node:stream";

import { saveContribute } from "../scripts/contributeflow.mjs";
import { COMMUNITY_TOKEN } from "./community-server.mjs";

/** A fixed clock: noon UTC on 2026-10-21. Yesterday (2026-10-20) is a closed day. */
export const NOW = Date.parse("2026-10-21T12:00:00Z");
export const YESTERDAY_MS = Date.parse("2026-10-20T10:30:45Z");

/** io for runContribute: collects stdout and stderr, feeds `stdin`, never sleeps. */
export function mkIo({ stdin = "", isTTY = true, env, fetchImpl, nowMs = NOW } = {}) {
  const out = [];
  const err = [];
  return {
    io: {
      stdout: { write: (s) => out.push(String(s)) },
      stderr: { write: (s) => err.push(String(s)) },
      stdin: stdin === null ? Readable.from([]) : Readable.from([stdin]),
      env,
      isTTY,
      fetchImpl,
      sleepImpl: async () => {},
      nowMs,
    },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

/** A response in the sync entry shape ({host, receipt}) that passes receiptProblem. */
export function resp(n, opts = {}) {
  const {
    tsMs = YESTERDAY_MS,
    provider = "anthropic",
    model = "claude-sonnet-5-5",
    tokensIn = 1000,
    tokensOut = 200,
    cacheReadTokens = 600,
    cacheWriteTokens = 100,
    tokenSource = "reported",
    host = "claude",
    energyWh = 0.4,
    carbonG = 0.15,
    waterMl = 2,
  } = opts;
  return {
    host,
    receipt: {
      rid: n.toString(16).padStart(32, "0"),
      tsUtc: new Date(tsMs).toISOString(),
      provider,
      model,
      tokensIn,
      tokensOut,
      cacheReadTokens,
      cacheWriteTokens,
      tokenSource,
      energyWh,
      carbonG,
      waterMl,
      treeTimeMin: 3,
      aiedsModelVersion: "v2",
      aiedsVersion: "2.5.0",
    },
  };
}

/** Writes contribute.json as `aieds contribute on` would, pointing at `endpoint`. */
export function turnOnDirect(env, endpoint, extra = {}) {
  saveContribute(
    {
      endpoint,
      token: COMMUNITY_TOKEN,
      enabled: true,
      consentVersion: 1,
      consentAt: "2026-10-21T00:00:00.000Z",
      withdrawPending: false,
      ...extra,
    },
    env,
  );
}

/** A fetch that records every call and answers like a dead network. */
export function spyFetch() {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    throw new Error("network is not available in this test");
  };
  fn.calls = calls;
  return fn;
}

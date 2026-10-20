// Shared helpers for the sync tests: a fake sync server that behaves like the
// ruok sync backend (PR 687) for the parts the client touches, a CLI runner, and
// throwaway directories. The fake server's allowlist is written out here by
// hand from the backend's table, NOT imported from the client, so a client that
// drifts from the backend fails against it.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const pluginRoot = resolve(here, "..");
export const script = join(pluginRoot, "scripts", "aieds.mjs");
export const fixture = (name) => join(here, "fixtures", name);
export const fixtureText = (name) => readFileSync(fixture(name), "utf8");

export const CANARY = "CANARY-DO-NOT-STORE";

/** A POSIX home prefix, built so the "no personal paths" scan of committed files does not trip on a test string. */
export const POSIX_HOME = ["", "home", ""].join("/");

/** A fresh directory whose name has a space, because Windows paths do. */
export function tmpDir(prefix = "rk sync test ") {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Runs the CLI (the plugin script) as a child process. */
export function runCli(args, { input, env = {}, timeoutMs = 20000 } = {}) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr, ms: Date.now() - started });
    });
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

/** Environment for a hermetic run: its own config dir, no real home touched. */
export function hermeticEnv(dir, extra = {}) {
  return {
    AIEDS_CONFIG_DIR: join(dir, "config"),
    COPILOT_HOME: join(dir, "copilot"),
    GROK_HOME: join(dir, "grok"),
    AIEDS_SYNC: "",
    AIEDS_RECEIPTS: "",
    AIEDS_RECEIPT_LOG: "",
    AIEDS_RECEIPT_LOG_FORMAT: "",
    ...extra,
  };
}

// -- The backend's allowlist, copied by hand from ruok functions/src/sync/schema.ts ----

const SERVER_RECEIPT_KEYS = [
  "rid", "tsUtc", "provider", "model", "tokensIn", "tokensOut", "cacheReadTokens",
  "cacheWriteTokens", "tokenSource", "energyWh", "carbonG", "waterMl", "treeTimeMin",
  "aiedsModelVersion", "aiedsVersion", "provenance", "confidence", "agentId", "activity",
  "latencyMs",
];
const SERVER_CLIENT_KEYS = ["name", "version", "host"];
const SERVER_HOSTS = [
  "claude", "codex", "gemini", "cursor", "windsurf", "copilot", "opencode", "cline", "roo",
  "aider", "zed", "continue", "amp", "goose", "ollama", "lmstudio", "grok", "proxy", "otel",
  "file", "other",
];

function serverCheck(batch) {
  if (batch === null || typeof batch !== "object") return { status: 400, body: { error: "invalid_request" } };
  for (const k of Object.keys(batch)) {
    if (!["schema", "client", "receipts"].includes(k)) return { status: 400, body: { error: "unknown_field", field: k } };
  }
  if (batch.schema !== "rk-receipts/1") return { status: 400, body: { error: "invalid_request" } };
  for (const k of Object.keys(batch.client ?? {})) {
    if (!SERVER_CLIENT_KEYS.includes(k)) return { status: 400, body: { error: "unknown_field", field: k } };
  }
  if (!SERVER_HOSTS.includes(batch.client?.host)) return { status: 400, body: { error: "invalid_request" } };
  if (!Array.isArray(batch.receipts) || batch.receipts.length < 1) return { status: 400, body: { error: "invalid_request" } };
  if (batch.receipts.length > 100) return { status: 400, body: { error: "too_many" } };
  for (const r of batch.receipts) {
    for (const k of Object.keys(r)) {
      if (!SERVER_RECEIPT_KEYS.includes(k)) return { status: 400, body: { error: "unknown_field", field: k } };
    }
  }
  return null;
}

/**
 * Starts the fake backend on 127.0.0.1. `server.mode` switches the behavior of
 * syncReceipts while the test runs: "ok", "500", "429", "400", "revoked",
 * "blackhole" (never answers), "legacy" (rejects every receipt as model_version).
 */
export async function startFakeServer({ port = 0, onRequest } = {}) {
  const server = {
    mode: "ok",
    requests: [],
    bodies: [],
    rids: new Set(),
    tokens: new Set(),
    polls: 0,
    approveAfter: 1,
    revoked: false,
    base: "",
    close: () => new Promise((r) => http.close(r)),
  };
  const http = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const path = req.url.split("?")[0].replace(/^\//, "");
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { __unparsed: true };
      }
      server.requests.push({ path, headers: req.headers, raw });
      if (onRequest) onRequest(path, body);
      server.bodies.push(raw);
      const send = (status, obj) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method !== "POST") return send(405, { error: "method_not_allowed" });
      if (req.headers.origin) return send(403, { error: "origin_not_allowed" });

      if (path === "syncDeviceStart") {
        for (const k of Object.keys(body)) {
          if (!["client", "clientVersion", "deviceLabel"].includes(k)) return send(400, { error: "unknown_field", field: k });
        }
        server.lastStart = body;
        return send(200, {
          deviceCode: "d".repeat(43),
          userCode: "KNGT-7QMP",
          verificationUri: `${server.base}/reports/connect/`,
          verificationUriComplete: `${server.base}/reports/connect/?code=KNGT-7QMP`,
          expiresInSec: 600,
          intervalSec: 0,
        });
      }
      if (path === "syncDevicePoll") {
        server.polls += 1;
        if (server.polls <= server.approveAfter) return send(200, { status: "pending" });
        const token = `rkd_${"T".repeat(43)}`;
        server.tokens.add(token);
        return send(200, { status: "approved", token, deviceId: "0123456789abcdef", scopes: ["receipts:write"], uidHint: null });
      }
      if (path === "syncReceipts") {
        const auth = String(req.headers.authorization ?? "");
        const token = auth.replace(/^Bearer /, "");
        if (server.mode === "blackhole") return; // never answers
        if (server.mode === "revoked" || server.revoked || !server.tokens.has(token)) {
          return send(401, { error: server.revoked || server.mode === "revoked" ? "token_revoked" : "token_invalid" });
        }
        if (body && body.op === "revoke") {
          server.revoked = true;
          return send(200, { revoked: true });
        }
        if (server.mode === "500") return send(500, { error: "internal" });
        if (server.mode === "429") return send(429, { error: "rate_limited", reason: "per-device", retryAfterSec: 60 });
        if (server.mode === "400") return send(400, { error: "invalid_request" });
        const bad = serverCheck(body);
        if (bad) return send(bad.status, bad.body);
        if (server.mode === "legacy") {
          return send(200, {
            accepted: 0,
            duplicates: 0,
            rejected: body.receipts.map((r, index) => ({ index, rid: r.rid, reason: "model_version" })),
            currentModelVersion: "v9",
          });
        }
        let accepted = 0;
        let duplicates = 0;
        for (const r of body.receipts) {
          if (server.rids.has(r.rid)) duplicates += 1;
          else {
            server.rids.add(r.rid);
            accepted += 1;
            server.accepted = (server.accepted ?? []).concat([r]);
          }
        }
        return send(200, { accepted, duplicates, rejected: [], legacyVersion: 0, nextMaxBatch: 100, rolledUp: 0 });
      }
      return send(404, { error: "not_found" });
    });
  });
  await new Promise((r) => http.listen(port, "127.0.0.1", r));
  server.base = `http://127.0.0.1:${http.address().port}`;
  server.close = () =>
    new Promise((r) => {
      http.closeAllConnections?.();
      http.close(r);
    });
  return server;
}

/** Connects a hermetic config dir to a fake server without going through the CLI. */
export async function connectDirect(env, server) {
  const store = await import("../scripts/store.mjs");
  const token = `rkd_${"T".repeat(43)}`;
  server.tokens.add(token);
  store.saveConnection(
    { endpoint: server.base, token, deviceId: "0123456789abcdef", connectedAt: new Date().toISOString(), queueMax: 2000 },
    env,
  );
  return token;
}

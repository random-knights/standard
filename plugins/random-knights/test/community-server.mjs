// A local stand-in for the community contribution backend (ruok functions/src/
// community/, CONTRIBUTE-SPEC 3.2) for the parts the CLI touches. Its bucket
// allowlist is written out here by hand from the backend's table
// (schema.ts BUCKET_FIELDS), NOT imported from the client, so a client that
// drifts from the backend fails against it. It listens on 127.0.0.1 only and
// stores nothing but what a test needs to look at.
import { createServer } from "node:http";

const BUCKET_KEYS = [
  "schema", "day", "provider", "model", "host", "tokenSource", "responses", "tokensIn", "tokensOut",
  "cacheReadTokens", "cacheWriteTokens", "aiedsModelVersion", "aiedsVersion", "energyWh", "carbonG",
  "waterL", "treeTimeMin",
];
const REQUIRED = [
  "schema", "day", "provider", "model", "host", "tokenSource", "responses", "tokensIn", "tokensOut",
  "aiedsModelVersion", "energyWh", "carbonG", "waterL", "treeTimeMin",
];

export const COMMUNITY_TOKEN = `rkc_${"C".repeat(43)}`;

/**
 * `server.mode` switches the behavior of communitySubmit while a test runs:
 * "ok", "500", "503-paused", "503-unavailable", "404", "429", "400", "revoked",
 * "consent", "blackhole" (never answers), "reject-ledger" (rejects bucket 0 as
 * ledger_full), "reject-bad" (rejects bucket 0 as invalid_model).
 * `server.pollsBeforeApproval` is how many polls answer pending first.
 */
export async function startCommunityServer({ port = 0 } = {}) {
  const server = {
    mode: "ok",
    calls: [],
    requests: [],
    buckets: [],
    polls: 0,
    pollsBeforeApproval: 1,
    pollMode: "approve",
    startMode: "ok",
    statusMode: "ok",
    deleteMode: "ok",
    withdrawMode: "ok",
    tokenLive: false,
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
      server.calls.push(path);
      const send = (status, obj) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method !== "POST") return send(405, { error: "method_not_allowed" });
      if (req.headers.origin) return send(403, { error: "origin_not_allowed" });

      if (path === "communityDeviceStart") {
        if (server.startMode === "404") return send(404, { error: "not_found" });
        for (const k of Object.keys(body)) {
          if (!["client", "clientVersion", "deviceLabel"].includes(k)) return send(400, { error: "unknown_field", field: k });
        }
        server.lastStart = body;
        return send(200, {
          deviceCode: "d".repeat(43),
          userCode: "KNGT-7QMP",
          verificationUri: `${server.base}/contribute/`,
          verificationUriComplete: `${server.base}/contribute/?code=KNGT-7QMP`,
          expiresInSec: 600,
          intervalSec: 0,
        });
      }
      if (path === "communityDevicePoll") {
        server.polls += 1;
        if (server.pollMode === "denied") return send(200, { status: "denied" });
        if (server.polls <= server.pollsBeforeApproval) return send(200, { status: "pending" });
        server.tokenLive = true;
        return send(200, { status: "approved", token: COMMUNITY_TOKEN, scopes: ["community:write"] });
      }

      const auth = String(req.headers.authorization ?? "");
      const token = auth.replace(/^Bearer /, "");
      server.lastToken = token;
      if (server.mode === "blackhole" && path === "communitySubmit") return; // never answers
      if (token !== COMMUNITY_TOKEN || !server.tokenLive) return send(401, { error: "token_invalid" });

      if (path === "communityStatus") {
        if (server.statusMode === "500") return send(500, { error: "internal" });
        return send(200, {
          consentVersion: 1, consentCurrent: true, grantedAt: "2026-10-21T00:00:00.000Z",
          withdrawn: false, lastSubmitDay: "2026-10-20", bucketsHeldThisMonth: 3,
        });
      }
      if (path === "communityWithdraw") {
        if (server.withdrawMode === "500") return send(500, { error: "internal" });
        if (Object.keys(body).length !== 1 || body.op !== "off") return send(400, { error: "invalid_request" });
        server.tokenLive = false;
        return send(200, { withdrawn: true });
      }
      if (path === "communityDelete") {
        if (server.deleteMode === "500") return send(500, { error: "internal" });
        for (const k of Object.keys(body)) if (k !== "forget") return send(400, { error: "unknown_field", field: k });
        server.lastDelete = body;
        if (body.forget === true) server.tokenLive = false;
        return send(200, { rawRowsDeleted: 4, ledgerDeleted: 1, forgotten: body.forget === true });
      }
      if (path === "communitySubmit") {
        if (server.mode === "500") return send(500, { error: "internal" });
        if (server.mode === "503-paused") return send(503, { error: "paused", message: "Community contribution is paused." });
        if (server.mode === "503-unavailable") return send(503, { error: "unavailable" });
        if (server.mode === "404") return send(404, { error: "not_found" });
        if (server.mode === "429") return send(429, { error: "rate_limited", retryAfterSec: 60 });
        if (server.mode === "400") return send(400, { error: "invalid_request" });
        if (server.mode === "revoked") return send(401, { error: "token_revoked" });
        if (server.mode === "consent") return send(403, { error: "consent_required" });
        for (const k of Object.keys(body)) {
          if (k !== "buckets") return send(400, { error: "unknown_field", field: k });
        }
        if (!Array.isArray(body.buckets) || body.buckets.length < 1) return send(400, { error: "invalid_request" });
        if (body.buckets.length > 50) return send(400, { error: "too_many" });
        for (const b of body.buckets) {
          for (const k of Object.keys(b)) {
            if (!BUCKET_KEYS.includes(k)) return send(400, { error: "unknown_field", field: k });
          }
          for (const k of REQUIRED) {
            if (b[k] === undefined) return send(200, { accepted: 0, rejected: [{ index: 0, reason: `missing_${k}` }] });
          }
        }
        const rejected = [];
        if (server.mode === "reject-ledger") rejected.push({ index: 0, reason: "ledger_full" });
        if (server.mode === "reject-bad") rejected.push({ index: 0, reason: "invalid_model" });
        const rejectedIdx = new Set(rejected.map((r) => r.index));
        let accepted = 0;
        body.buckets.forEach((b, i) => {
          if (rejectedIdx.has(i)) return;
          accepted += 1;
          server.buckets.push(b);
        });
        return send(200, { accepted, replaced: 0, duplicates: 0, ignored: 0, rejected, serverDay: "2026-10-21" });
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

// The local files of the sync: where they live on each system, the token file's
// permissions, the bounded queue, and the Copilot read positions.
import assert from "node:assert/strict";
import test from "node:test";
import { appendFileSync, existsSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { copilotHome } from "../scripts/hosts/copilot.mjs";
import {
  clearConnection,
  configDir,
  enqueue,
  loadConnection,
  loadMarks,
  loadState,
  paths,
  readQueue,
  removeFromQueue,
  saveConnection,
  saveMarks,
  syncDisabled,
  takeLock,
} from "../scripts/store.mjs";
import { tmpDir } from "./helpers.mjs";

const entry = (n, host = "claude") => ({ host, receipt: { rid: n.toString(16).padStart(32, "0"), tokensIn: n } });

function env() {
  return { AIEDS_CONFIG_DIR: join(tmpDir(), "cfg") };
}

test("config dir: APPDATA on Windows, XDG_CONFIG_HOME then ~/.config elsewhere, override wins", () => {
  const win = configDir({ APPDATA: "C:\\Users\\a b\\AppData\\Roaming" }, "win32");
  assert.ok(win.startsWith("C:\\Users\\a b\\AppData\\Roaming"), win);
  assert.ok(win.endsWith("random-knights"));
  const xdg = configDir({ XDG_CONFIG_HOME: join("x", "cfg") }, "linux");
  assert.equal(xdg, join("x", "cfg", "random-knights"));
  const dflt = configDir({}, "darwin");
  assert.ok(dflt.endsWith(join(".config", "random-knights")), dflt);
  assert.equal(configDir({ AIEDS_CONFIG_DIR: "/elsewhere", APPDATA: "C:\\x" }, "win32"), "/elsewhere");
  // No APPDATA on Windows: fall back to the user profile, not to a relative path.
  const noAppData = configDir({ USERPROFILE: "C:\\Users\\kit" }, "win32");
  assert.ok(noAppData.includes("AppData"), noAppData);
});

test("copilot home: COPILOT_HOME wins, else the user profile's .copilot", () => {
  assert.equal(copilotHome({ COPILOT_HOME: join("a", "b") }), join("a", "b"));
  assert.ok(copilotHome({}).endsWith(".copilot"));
  if (process.platform === "win32") {
    assert.equal(copilotHome({ USERPROFILE: "C:\\Users\\a b" }), join("C:\\Users\\a b", ".copilot"));
  }
});

test("connection: saved with owner-only permissions on POSIX, loaded back, cleared with the queue", () => {
  const e = env();
  assert.equal(loadConnection(e), undefined);
  saveConnection({ endpoint: "https://example.test", token: `rkd_${"x".repeat(43)}`, deviceId: "abc", connectedAt: "2026-10-20T00:00:00.000Z" }, e);
  const file = paths(e).sync;
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
  const c = loadConnection(e);
  assert.equal(c.deviceId, "abc");
  assert.equal(c.queueMax, 2000);
  enqueue([entry(1)], c, e);
  assert.equal(clearConnection(e), true);
  assert.equal(loadConnection(e), undefined);
  assert.equal(readQueue(e).length, 0);
  assert.equal(clearConnection(e), false);
});

test("connection: a file with a token that is not a device token is not a connection", () => {
  const e = env();
  saveConnection({ endpoint: "https://example.test", token: "not-a-device-token", deviceId: "", connectedAt: "" }, e);
  assert.equal(loadConnection(e), undefined);
  writeFileSync(paths(e).sync, "{ torn");
  assert.equal(loadConnection(e), undefined);
});

test("queue: bounded, the oldest are dropped and counted, duplicates are not queued twice", () => {
  const e = env();
  const conn = { queueMax: 5 };
  enqueue([entry(1), entry(2), entry(3)], conn, e);
  assert.equal(enqueue([entry(2)], conn, e).queued, 0, "same rid, not queued again");
  const r = enqueue([entry(4), entry(5), entry(6), entry(7)], conn, e);
  assert.equal(r.dropped, 2);
  assert.deepEqual(readQueue(e).map((x) => x.receipt.tokensIn), [3, 4, 5, 6, 7]);
  assert.equal(loadState(e).dropped, 2);
});

test("queue: a torn or foreign line is skipped, and removal keeps entries added meanwhile", () => {
  const e = env();
  enqueue([entry(1), entry(2)], { queueMax: 10 }, e);
  appendFileSync(paths(e).queue, "{ torn line\n[1,2]\n");
  assert.equal(readQueue(e).length, 2);
  enqueue([entry(3)], { queueMax: 10 }, e);
  removeFromQueue(new Set([entry(1).receipt.rid]), e);
  assert.deepEqual(readQueue(e).map((x) => x.receipt.tokensIn), [2, 3]);
});

test("lock: one flusher at a time, a stale lock is taken over", () => {
  const e = env();
  const release = takeLock(e);
  assert.equal(typeof release, "function");
  assert.equal(takeLock(e), undefined, "held");
  const old = new Date(Date.now() - 5 * 60 * 1000);
  utimesSync(paths(e).lock, old, old);
  const again = takeLock(e);
  assert.equal(typeof again, "function", "stale lock replaced");
  again();
  assert.ok(!existsSync(paths(e).lock));
});

test("read positions: stored under a hash, bounded, junk ignored", () => {
  const e = env();
  const marks = {};
  for (let i = 0; i < 250; i += 1) marks[i.toString(16).padStart(32, "0")] = { pos: i, seenAtMs: i };
  saveMarks(marks, e);
  const back = loadMarks(e);
  assert.equal(Object.keys(back).length, 200);
  assert.ok(back[(249).toString(16).padStart(32, "0")], "the newest are kept");
  writeFileSync(paths(e).marks ?? join(paths(e).dir, "copilot-marks.json"), JSON.stringify({ "not a hash": { pos: 1 }, [("a").repeat(32)]: { pos: "x" } }));
  assert.deepEqual(loadMarks(e), {});
  assert.ok(!readFileSync(join(paths(e).dir, "copilot-marks.json"), "utf8").includes("CANARY"));
});

test("AIEDS_SYNC: off, 0, false, no and disabled all switch it off", () => {
  for (const v of ["off", "OFF", "0", "false", "no", "disabled"]) assert.equal(syncDisabled({ AIEDS_SYNC: v }), true, v);
  for (const v of ["", "on", "1", undefined]) assert.equal(syncDisabled({ AIEDS_SYNC: v }), false, String(v));
});

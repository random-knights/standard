// The canary test (PROVIDERS-SPEC section 5): a string planted in every kind of
// text a host session holds must never reach stdout, stderr, the receipt log,
// the sync queue, the state or read-position files, or the bytes sent to the
// sync server. It runs the real commands against the fake backend, for each of
// the five v1 hosts and for the Ollama wrapper.
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CANARY, connectDirect, fixtureText, hermeticEnv, runCli, startFakeServer, tmpDir } from "./helpers.mjs";

/** Every file under a directory, as text. */
function allText(dir) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.push([p, readFileSync(p, "utf8")]);
    }
  };
  walk(dir);
  return out;
}

/** Fails if the canary appears anywhere the tool wrote, said, or sent. */
function assertClean(label, { results, dir, server, allow = [] }) {
  for (const r of results) {
    assert.ok(!r.stdout.includes(CANARY), `${label}: stdout`);
    assert.ok(!r.stderr.includes(CANARY), `${label}: stderr`);
  }
  for (const [path, text] of allText(join(dir, "config"))) {
    assert.ok(!text.includes(CANARY), `${label}: config file ${path}`);
  }
  for (const [path, text] of allText(dir)) {
    if (allow.some((a) => path.includes(a))) continue;
    if (path.includes("receipts.jsonl")) assert.ok(!text.includes(CANARY), `${label}: log ${path}`);
  }
  for (const body of server.bodies) assert.ok(!body.includes(CANARY), `${label}: sync payload`);
}

const plant = (text) => text.replace(/CANARY_[A-Z0-9_]+/g, CANARY);

async function scenario(label, run) {
  // Twice: once with the backend down (the receipt stays in the QUEUE, which is
  // then scanned) and once with it up (the PAYLOAD is scanned).
  for (const mode of ["500", "ok"]) {
    const dir = tmpDir();
    const server = await startFakeServer();
    server.mode = mode;
    const env = hermeticEnv(dir, {
      AIEDS_RECEIPT_LOG: join(dir, "receipts.jsonl"),
      AIEDS_RECEIPT_LOG_FORMAT: mode === "ok" ? "rk-receipts" : "",
    });
    try {
      await connectDirect(env, server);
      const results = await run({ dir, env, server });
      assertClean(`${label} (${mode})`, { results, dir, server });
      if (mode === "500") {
        const queued = readFileSync(join(dir, "config", "sync-queue.jsonl"), "utf8");
        assert.ok(queued.trim().length > 0, `${label}: something was queued to scan`);
      } else {
        assert.ok(server.bodies.some((b) => b.includes("rk-receipts/1")), `${label}: something was sent to scan`);
      }
    } finally {
      await server.close();
    }
  }
}

test("canary: Claude Code transcript and hook input", async () => {
  await scenario("claude", async ({ dir, env }) => {
    const path = join(dir, "claude.jsonl");
    writeFileSync(path, plant(fixtureText("session-tool-turns.jsonl")));
    assert.ok(readFileSync(path, "utf8").includes(CANARY), "planted");
    const r = await runCli(["hook"], {
      env,
      input: JSON.stringify({
        session_id: "00000000-0000-4000-8000-000000000001",
        transcript_path: path,
        hook_event_name: "Stop",
        last_assistant_message: `${CANARY}`,
      }),
    });
    assert.match(r.stdout, /systemMessage/);
    return [r];
  });
});

test("canary: Codex rollout and hook input", async () => {
  await scenario("codex", async ({ dir, env }) => {
    const path = join(dir, "rollout-2026-10-20T10-11-10-01a159a6-dede-74a0-a36b-7309310bfe20.jsonl");
    writeFileSync(path, plant(fixtureText("codex-rollout.jsonl")));
    assert.ok(readFileSync(path, "utf8").includes(CANARY), "planted");
    const r = await runCli(["hook"], {
      env,
      input: JSON.stringify({ session_id: "01a159a6-dede-74a0-a36b-7309310bfe20", turn_id: "turn-B", transcript_path: path, hook_event_name: "Stop", last_assistant_message: CANARY }),
    });
    assert.match(r.stdout, /systemMessage/);
    return [r];
  });
});

test("canary: Grok Build session", async () => {
  await scenario("grok", async ({ dir, env }) => {
    const path = join(dir, "grok-updates.jsonl");
    writeFileSync(path, plant(fixtureText("grok-updates.jsonl")));
    assert.ok(readFileSync(path, "utf8").includes(CANARY), "planted");
    const hook = await runCli(["hook"], {
      env,
      input: JSON.stringify({ sessionId: "00000000-0000-4000-8000-0000000000d1", promptId: "prompt-B", transcriptPath: path }),
    });
    assert.match(hook.stdout, /systemMessage/);
    // And the on-demand route, including the receipts file it can write.
    const file = await runCli(["receipt", "--transcript", path, "--format", "rk-receipts", "--sync"], { env });
    assert.ok(file.stdout.includes('"rid"'));
    return [hook, file];
  });
});

test("canary: Copilot CLI events file (usage lines only are read)", async () => {
  await scenario("copilot", async ({ dir, env }) => {
    const sid = "76271fba-e658-4ec1-8603-e756a8676870";
    const folder = join(dir, "copilot", "session-state", sid);
    mkdirSync(folder, { recursive: true });
    const file = join(folder, "events.jsonl");
    const real = fixtureText("copilot-usage-real.jsonl").split("\n").filter(Boolean);
    const text = (kind) => JSON.stringify({ type: kind, data: { content: `${CANARY} ${kind}`, prompt: CANARY, toolArgs: { cmd: CANARY } } });
    writeFileSync(
      file,
      [text("user.message"), text("model.messages_snapshot"), real[0], text("assistant.message"), text("tool.execution_complete"), real[1], text("assistant.message")]
        .map((l) => `${l}\n`)
        .join(""),
    );
    const r = await runCli(["hook", "copilot"], { env, input: JSON.stringify({ sessionId: sid, transcriptPath: file, stopReason: "end_turn", prompt: CANARY }) });
    assert.match(r.stdout, /AiEDs receipt/);
    appendFileSync(file, `${text("user.message")}\n${real[2]}\n${text("assistant.message")}\n`);
    const r2 = await runCli(["hook", "copilot"], { env, input: JSON.stringify({ sessionId: sid, transcriptPath: file }) });
    assert.match(r2.stdout, /AiEDs receipt/);
    return [r, r2];
  });
});

test("canary: Ollama wrapper, streaming and not, against a fake Ollama", async () => {
  const final = {
    model: "llama3.2:1b",
    message: { role: "assistant", content: "" },
    done: true,
    prompt_eval_count: 28,
    prompt_eval_cached_count: 0,
    eval_count: 3,
  };
  const ollama = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (body.stream) {
        res.writeHead(200, { "content-type": "application/x-ndjson" });
        res.write(`${JSON.stringify({ model: "llama3.2:1b", message: { role: "assistant", content: `${CANARY} reply ` }, done: false })}\n`);
        res.end(`${JSON.stringify(final)}\n`);
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...final, message: { role: "assistant", content: `${CANARY} reply` } }));
      }
    });
  });
  await new Promise((r) => ollama.listen(0, "127.0.0.1", r));
  const host = `http://127.0.0.1:${ollama.address().port}`;
  try {
    await scenario("ollama", async ({ env }) => {
      // --no-text: the reply is the one thing this command prints by design,
      // so the stdout check applies to the receipt-only run.
      const plain = await runCli(["ollama", "--model", "llama3.2:1b", "--host", host, "--no-text", `${CANARY} prompt`], { env });
      assert.match(plain.stdout, /Tokens: 28 in, 3 out\./);
      const streamed = await runCli(["ollama", "--model", "llama3.2:1b", "--host", host, "--stream", "--no-text", `${CANARY} prompt`], { env });
      assert.match(streamed.stdout, /Tokens: 28 in, 3 out\./);
      return [plain, streamed];
    });
    // With the text shown, the reply IS printed (that is the command's job), but still never queued or sent.
    const dir = tmpDir();
    const server = await startFakeServer();
    const env = hermeticEnv(dir);
    await connectDirect(env, server);
    const shown = await runCli(["ollama", "--model", "llama3.2:1b", "--host", host, "--stream", "x"], { env });
    assert.ok(shown.stdout.includes(CANARY), "the reply is shown to the user who asked for it");
    for (const b of server.bodies) assert.ok(!b.includes(CANARY));
    for (const [, t] of allText(join(dir, "config"))) assert.ok(!t.includes(CANARY));
    await server.close();
  } finally {
    await new Promise((r) => ollama.close(r));
  }
});

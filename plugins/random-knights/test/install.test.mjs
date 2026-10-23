// `aieds install`: idempotent merge, a diff first, a .bak, --yes required, and
// command strings that survive Windows paths. Nothing here touches the real
// Copilot home: every run uses a throwaway COPILOT_HOME.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  HOST_COMMANDS,
  copilotCommands,
  copilotHookFilePath,
  installMarketplaceHost,
  lineDiff,
  mergeCopilotHooks,
} from "../scripts/install.mjs";
import { hermeticEnv, runCli, tmpDir, POSIX_HOME } from "./helpers.mjs";

const cmds = { powershell: "node 'C:\\a\\aieds.mjs' hook copilot", bash: "node '/a/aieds.mjs' hook copilot" };

// -- command strings ---------------------------------------------------------------------

test("copilot commands: a Windows path with spaces is one single-quoted PowerShell literal", () => {
  const c = copilotCommands("C:\\Users\\A B\\AppData\\Roaming\\npm\\node_modules\\@randomknights\\aieds\\bin\\aieds.mjs");
  assert.ok(c.powershell.startsWith("node 'C:"), c.powershell);
  assert.ok(c.powershell.endsWith("aieds.mjs' hook copilot"));
  assert.ok(!c.powershell.includes('"'), "no double quotes: PowerShell would expand $ inside them");
});

test("copilot commands: quotes and dollar signs in a path are escaped for each shell", () => {
  // resolve() makes the path absolute on the platform running the test; the quoting is what is under test.
  const ps = copilotCommands("C:\\Users\\O'Brien\\$home\\aieds.mjs").powershell;
  assert.ok(ps.includes("''"), "PowerShell doubles a single quote");
  const sh = copilotCommands(POSIX_HOME + "o'brien/$HOME/aieds.mjs").bash;
  assert.ok(sh.includes("'\\''"), "bash closes, escapes and reopens the quote");
  assert.ok(sh.includes("$HOME"), "and keeps $ literal inside single quotes");
});

test("copilot commands: from an npx cache the hook calls npx, which survives a cache clean", () => {
  for (const p of [
    "C:\\Users\\a\\AppData\\Local\\npm-cache\\_npx\\abc123\\node_modules\\@randomknights\\aieds\\bin\\aieds.mjs",
    POSIX_HOME + "a/.npm/_npx/abc/node_modules/@randomknights/aieds/bin/aieds.mjs",
  ]) {
    const c = copilotCommands(p);
    assert.equal(c.powershell, "npx --yes @randomknights/aieds hook copilot");
    assert.equal(c.bash, c.powershell);
  }
  assert.equal(copilotCommands("").powershell, "npx --yes @randomknights/aieds hook copilot");
});

test("copilot hook file path: COPILOT_HOME wins, else %USERPROFILE%/.copilot/hooks", () => {
  assert.equal(copilotHookFilePath({ COPILOT_HOME: join("x", "h") }), join("x", "h", "hooks", "random-knights.json"));
  const dflt = copilotHookFilePath({});
  assert.ok(dflt.endsWith(join(".copilot", "hooks", "random-knights.json")), dflt);
});

// -- merge ---------------------------------------------------------------------------------

test("merge: a new file is version 1 with one agentStop command hook", () => {
  const doc = JSON.parse(mergeCopilotHooks(undefined, cmds));
  assert.equal(doc.version, 1);
  assert.equal(doc.hooks.agentStop.length, 1);
  assert.deepEqual(doc.hooks.agentStop[0], { type: "command", powershell: cmds.powershell, bash: cmds.bash, timeoutSec: 10 });
});

test("merge: idempotent, and it keeps every other hook and key", () => {
  const mine = mergeCopilotHooks(undefined, cmds);
  assert.equal(mergeCopilotHooks(mine, cmds), mine, "merging twice changes nothing");

  const theirs = JSON.stringify({
    version: 1,
    extra: { keep: true },
    hooks: {
      sessionStart: [{ type: "command", bash: "echo hi" }],
      agentStop: [{ type: "command", bash: "echo other tool" }],
    },
  });
  const merged = JSON.parse(mergeCopilotHooks(theirs, cmds));
  assert.deepEqual(merged.extra, { keep: true });
  assert.equal(merged.hooks.sessionStart.length, 1);
  assert.equal(merged.hooks.agentStop.length, 2);
  assert.equal(merged.hooks.agentStop[0].bash, "echo other tool");
  const again = mergeCopilotHooks(JSON.stringify(merged), cmds);
  assert.equal(JSON.parse(again).hooks.agentStop.length, 2, "no second copy of our entry");

  // A changed script path REPLACES our entry instead of stacking another.
  const moved = JSON.parse(mergeCopilotHooks(again, { powershell: "node 'D:\\b\\aieds.mjs' hook copilot", bash: "node '/b/aieds.mjs' hook copilot" }));
  assert.equal(moved.hooks.agentStop.length, 2);
});

test("merge: unreadable JSON is refused, never overwritten", () => {
  assert.throws(() => mergeCopilotHooks("{ not json", cmds));
  assert.throws(() => mergeCopilotHooks("[1,2]", cmds));
  assert.throws(() => mergeCopilotHooks('{"hooks":[]}', cmds));
});

test("diff: shows additions, and is empty for equal text", () => {
  assert.equal(lineDiff("a\nb\n", "a\nb\n"), "");
  const d = lineDiff("a\nb", "a\nc\nb", "old", "new");
  assert.match(d, /^--- old\n\+\+\+ new/);
  assert.match(d, /\n\+ c\n/);
});

// -- the command, against a throwaway Copilot home ------------------------------------------------

test("install copilot: prints a diff and writes nothing without --yes", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  const r = await runCli(["install", "copilot"], { env });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Proposed change/);
  assert.match(r.stdout, /\+ {2}"agentStop"|\+\s+"agentStop"/);
  assert.match(r.stdout, /Nothing was written/);
  assert.ok(!existsSync(join(dir, "copilot")), "no folder created either");
});

test("install copilot --yes: writes once, then says already installed; a changed file gets a .bak", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  const file = join(dir, "copilot", "hooks", "random-knights.json");

  const first = await runCli(["install", "copilot", "--yes"], { env });
  assert.match(first.stdout, /Written:/);
  assert.ok(existsSync(file));
  assert.ok(!readdirSync(join(dir, "copilot", "hooks")).some((n) => n.includes(".bak")), "no backup of a file that did not exist");
  const doc = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(doc.hooks.agentStop.length, 1);
  assert.match(doc.hooks.agentStop[0].powershell, /^node '.+aieds\.mjs' hook copilot$/);
  assert.match(doc.hooks.agentStop[0].bash, /^node '.+aieds\.mjs' hook copilot$/);
  assert.equal(doc.hooks.agentStop[0].timeoutSec, 10);

  const second = await runCli(["install", "copilot", "--yes"], { env });
  assert.match(second.stdout, /Already installed/);
  assert.equal(readFileSync(file, "utf8"), JSON.stringify(doc, null, 2) + "\n", "byte-identical");

  // The user adds their own hook to the same file; install keeps it and backs up first.
  const edited = { ...doc, hooks: { ...doc.hooks, sessionEnd: [{ type: "command", bash: "echo bye" }] } };
  edited.hooks.agentStop = [{ type: "command", bash: "echo mine" }];
  writeFileSync(file, JSON.stringify(edited));
  const third = await runCli(["install", "copilot", "--yes"], { env });
  assert.match(third.stdout, /Backup: /);
  const names = readdirSync(join(dir, "copilot", "hooks"));
  assert.ok(names.includes("random-knights.json.bak"));
  assert.equal(JSON.parse(readFileSync(join(dir, "copilot", "hooks", "random-knights.json.bak"), "utf8")).hooks.agentStop[0].bash, "echo mine");
  const merged = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(merged.hooks.agentStop.length, 2);
  assert.equal(merged.hooks.sessionEnd[0].bash, "echo bye");
});

test("install copilot --yes: a broken existing file is left alone", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  mkdirSync(join(dir, "copilot", "hooks"), { recursive: true });
  const file = join(dir, "copilot", "hooks", "random-knights.json");
  writeFileSync(file, "{ nope");
  const r = await runCli(["install", "copilot", "--yes"], { env });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Not changed/);
  assert.equal(readFileSync(file, "utf8"), "{ nope");
});

test("install copilot: the hook it writes runs and prints a receipt for a real usage line", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  await runCli(["install", "copilot", "--yes"], { env });
  const doc = JSON.parse(readFileSync(join(dir, "copilot", "hooks", "random-knights.json"), "utf8"));
  const command = process.platform === "win32" ? doc.hooks.agentStop[0].powershell : doc.hooks.agentStop[0].bash;
  // Run the exact command string through the platform shell, as Copilot would.
  const { spawn } = await import("node:child_process");
  const sid = "76271fba-e658-4ec1-8603-e756a8676870";
  mkdirSync(join(dir, "copilot", "session-state", sid), { recursive: true });
  const real = readFileSync(new URL("./fixtures/copilot-usage-real.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean);
  writeFileSync(join(dir, "copilot", "session-state", sid, "events.jsonl"), `${real[0]}\n`);
  const out = await new Promise((resolve) => {
    const [shell, args] =
      process.platform === "win32" ? ["powershell", ["-NoProfile", "-Command", command]] : ["bash", ["-c", command]];
    const child = spawn(shell, args, { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify({ sessionId: sid }));
  });
  assert.equal(out.code, 0);
  assert.match(out.stdout, /^tokens {10}22\.8k in \(46% cache read\) - 56 out$/m);
});

// -- claude and codex -----------------------------------------------------------------------------

test("install claude and codex: print the exact commands and change nothing", async () => {
  const dir = tmpDir();
  const env = hermeticEnv(dir);
  const claude = await runCli(["install", "claude"], { env: { ...env, PATH: "" } });
  assert.match(claude.stdout, /claude plugin marketplace add Random-Knights\/Standard/);
  assert.match(claude.stdout, /claude plugin install random-knights@standard/);
  const codex = await runCli(["install", "codex"], { env: { ...env, PATH: "" } });
  assert.match(codex.stdout, /codex plugin marketplace add Random-Knights\/Standard/);
  assert.match(codex.stdout, /codex plugin add random-knights@standard/);
  assert.match(codex.stdout, /\/hooks/);
  assert.match(codex.stdout, /codex exec/);
  assert.equal(HOST_COMMANDS.claude.lines.length, 2);
});

test("install claude: the check reports listed, not listed, failed and missing", () => {
  const say = (run) => {
    let out = "";
    installMarketplaceHost("claude", { stdout: { write: (s) => (out += s) }, run });
    return out;
  };
  assert.match(say(() => ({ ok: true, text: "random-knights@standard enabled" })), /Check: random-knights is listed/);
  assert.match(say(() => ({ ok: true, text: "nothing" })), /not listed yet/);
  assert.match(say(() => ({ ok: false, text: "" })), /could not list/);
  assert.match(say(() => ({ ok: false, missing: true, text: "" })), /not found on PATH/);
});

test("install: an unknown host prints usage and exits 2", async () => {
  const r = await runCli(["install", "emacs"], { env: hermeticEnv(tmpDir()) });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /usage: aieds install/);
});

// `aieds install <host>`.
//
//   claude, codex   These install through the host's OWN plugin marketplace.
//                   This command only prints the exact commands and then checks
//                   whether the plugin is listed. It changes nothing.
//   copilot         The Copilot CLI has no plugin step for this, so the command
//                   writes ONE file it owns: <copilot home>/hooks/random-knights.json
//                   (%USERPROFILE%\.copilot\hooks\ on Windows). It merges
//                   idempotently, prints a diff first, makes a .bak of an
//                   existing file, and writes nothing without --yes. It never
//                   touches any other file of the user's.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { copilotHome } from "./hosts/copilot.mjs";

export const MARKETPLACE = "Random-Knights/Standard";
const HOOK_MARK = "hook copilot";
const NPX_COMMAND = "npx --yes @randomknights/aieds hook copilot";

export const HOST_COMMANDS = Object.freeze({
  claude: {
    bin: "claude",
    lines: [
      `claude plugin marketplace add ${MARKETPLACE}`,
      "claude plugin install random-knights@standard",
    ],
    notes: [
      "The plugin prints an AiEDs receipt under each reply.",
      "Optional: aieds connect  (sends the same numbers to your own account; off until you run it).",
    ],
  },
  codex: {
    bin: "codex",
    lines: [
      `codex plugin marketplace add ${MARKETPLACE}`,
      "codex plugin add random-knights@standard",
    ],
    notes: [
      "Then, once, inside Codex: run /hooks and trust the Random Knights Stop hook.",
      "Codex asks again after each plugin update (the trust is bound to the hook content).",
      "Interactive Codex shows the receipt. `codex exec` runs the hook silently: nothing is printed, but synced receipts are still sent if you ran aieds connect.",
    ],
  },
});

// -- A minimal line diff (LCS) ------------------------------------------------------

/** Unified-looking diff of two texts, line by line. Empty string when equal. */
export function lineDiff(oldText, newText, nameOld = "current", nameNew = "proposed") {
  const a = oldText.length > 0 ? oldText.replace(/\r\n/g, "\n").split("\n") : [];
  const b = newText.replace(/\r\n/g, "\n").split("\n");
  if (a.join("\n") === b.join("\n")) return "";
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines = [`--- ${nameOld}`, `+++ ${nameNew}`];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push(`  ${a[i]}`);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push(`- ${a[i]}`);
      i += 1;
    } else {
      lines.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  while (i < n) lines.push(`- ${a[i++]}`);
  while (j < m) lines.push(`+ ${b[j++]}`);
  return lines.join("\n");
}

// -- Copilot hook file ----------------------------------------------------------------

function psQuote(s) {
  return `'${s.replace(/'/g, "''")}'`;
}
function shQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** True for a path inside an npx or npm cache (it can be cleaned up under us). */
export function isEphemeralPath(p) {
  return /[\\/](_npx|npm-cache)[\\/]/i.test(p);
}

/**
 * The two command strings for the hook entry. `scriptPath` is the aieds
 * entry file that is running right now. From a stable place (a global install,
 * a repo clone) the hook calls `node` on that exact file with a quoted path.
 * From an npx cache it calls npx instead, so the hook survives a cache clean.
 *
 * PowerShell: a single-quoted literal (no expansion, `'` doubled), so a path
 * with spaces or a `$` is safe. bash: single quotes, `'` as '\''.
 */
export function copilotCommands(scriptPath) {
  if (typeof scriptPath !== "string" || scriptPath.length === 0 || isEphemeralPath(scriptPath)) {
    return { powershell: NPX_COMMAND, bash: NPX_COMMAND };
  }
  // A Windows drive path stays as given on any platform (resolve() would graft it onto a POSIX cwd).
  const abs = isAbsolute(scriptPath) || /^[A-Za-z]:[\\/]/.test(scriptPath) ? scriptPath : resolve(scriptPath);
  return {
    powershell: `node ${psQuote(abs)} ${HOOK_MARK}`,
    bash: `node ${shQuote(abs)} ${HOOK_MARK}`,
  };
}

export function copilotHookFilePath(env = process.env) {
  return join(copilotHome(env), "hooks", "random-knights.json");
}

function isOurs(entry) {
  if (entry === null || typeof entry !== "object") return false;
  return ["powershell", "bash", "command"].some(
    (k) => typeof entry[k] === "string" && entry[k].includes(HOOK_MARK) && /aieds|randomknights/i.test(entry[k]),
  );
}

/**
 * Returns the new file text: the existing JSON (other keys and other hooks kept)
 * with exactly one Random Knights agentStop entry. Throws on JSON it cannot
 * read, so the caller can refuse instead of overwriting.
 */
export function mergeCopilotHooks(existingText, commands) {
  let doc = {};
  if (existingText !== undefined && existingText.trim().length > 0) {
    doc = JSON.parse(existingText);
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      throw new Error("the existing file is not a JSON object");
    }
  }
  if (doc.version === undefined) doc.version = 1;
  if (doc.hooks === undefined) doc.hooks = {};
  if (doc.hooks === null || typeof doc.hooks !== "object" || Array.isArray(doc.hooks)) {
    throw new Error("the existing file has a hooks value that is not an object");
  }
  const list = Array.isArray(doc.hooks.agentStop) ? doc.hooks.agentStop : [];
  const kept = list.filter((e) => !isOurs(e));
  kept.push({
    type: "command",
    powershell: commands.powershell,
    bash: commands.bash,
    timeoutSec: 10,
  });
  doc.hooks.agentStop = kept;
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function uniqueBackup(path) {
  let bak = `${path}.bak`;
  for (let n = 1; existsSync(bak); n += 1) bak = `${path}.bak.${n}`;
  return bak;
}

/** `aieds install copilot [--yes]`. Returns the exit code. */
export function installCopilot(args, io) {
  const out = (s) => io.stdout.write(`${s}\n`);
  const env = io.env ?? process.env;
  const file = copilotHookFilePath(env);
  const commands = copilotCommands(io.scriptPath);

  let current;
  if (existsSync(file)) current = readFileSync(file, "utf8");
  let next;
  try {
    next = mergeCopilotHooks(current, commands);
  } catch (e) {
    out(`Not changed. ${file} could not be merged: ${e.message}.`);
    out("Fix or remove that file yourself and run this again.");
    return 1;
  }

  const diff = lineDiff(current ?? "", next, current === undefined ? "(new file)" : file, file);
  if (diff === "") {
    out(`Already installed. ${file} needs no change.`);
    return 0;
  }
  out(`Proposed change to ${file}:`);
  out(diff);
  if (!args.includes("--yes")) {
    out("");
    out("Nothing was written. Review the change above, then run the same command with --yes.");
    return 0;
  }
  mkdirSync(dirname(file), { recursive: true });
  if (current !== undefined) {
    const bak = uniqueBackup(file);
    copyFileSync(file, bak);
    out(`Backup: ${bak}`);
  }
  writeFileSync(file, next);
  out(`Written: ${file}`);
  out("Restart the Copilot CLI: it reads hooks at start.");
  out("Each reply then gets one AiEDs receipt from the session's own usage records. Optional: aieds connect.");
  return 0;
}

// -- Claude and Codex: print the commands, then check ------------------------------------

function defaultRun(bin, args) {
  // A fixed command with fixed arguments. shell:true only so Windows finds a
  // .cmd shim (npm installs hosts that way); nothing user-typed reaches it.
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    timeout: 20_000,
    shell: process.platform === "win32",
    windowsHide: true,
  });
  if (r.error) return { ok: false, missing: r.error.code === "ENOENT", text: "" };
  return { ok: r.status === 0, missing: false, text: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

export function installMarketplaceHost(host, io) {
  const out = (s) => io.stdout.write(`${s}\n`);
  const spec = HOST_COMMANDS[host];
  out(`Run these ${spec.lines.length} commands (this tool changes nothing itself):`);
  out("");
  for (const l of spec.lines) out(`  ${l}`);
  out("");
  for (const n of spec.notes) out(n);
  out("");
  const run = io.run ?? defaultRun;
  const r = run(spec.bin, ["plugin", "list"]);
  if (r.missing) {
    out(`Check: \`${spec.bin}\` was not found on PATH. Install ${spec.bin} first, then run the commands above.`);
  } else if (!r.ok) {
    out(`Check: could not list ${spec.bin} plugins (\`${spec.bin} plugin list\` failed). Run the commands above, then check inside ${spec.bin}.`);
  } else if (/random-knights/i.test(r.text)) {
    out(`Check: random-knights is listed by \`${spec.bin} plugin list\`.`);
  } else {
    out(`Check: random-knights is not listed yet by \`${spec.bin} plugin list\`. Run the commands above.`);
  }
  return 0;
}

/** `aieds install <host> [--yes]`. */
export function runInstall(args, io) {
  const host = args.find((a) => !a.startsWith("--"));
  const rest = args.filter((a) => a !== host);
  if (host === "copilot") return installCopilot(rest, io);
  if (host === "claude" || host === "codex") return installMarketplaceHost(host, io);
  io.stdout.write("usage: aieds install claude | codex | copilot [--yes]\n");
  return 2;
}

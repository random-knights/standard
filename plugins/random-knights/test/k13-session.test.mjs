// Gate: the K13 session start hook says what K13.md says. It reads the
// standard from this repository, so a K13 change that the hook does not
// follow turns this test red. Fast: one small spawn, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { K13_STEPS, K13_VERSION, hookOutput, k13SessionText } from "../hooks/k13-session.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const repoRoot = resolve(pluginRoot, "..", "..");
const k13 = readFileSync(join(repoRoot, "K13.md"), "utf8").replace(/\r\n/g, "\n");

// The numbered steps of K13.md, from "## The thirteen steps" to the next heading.
function standardSteps() {
  const start = k13.indexOf("\n## The thirteen steps\n");
  assert.ok(start >= 0, "K13.md has a section named The thirteen steps");
  const rest = k13.slice(start + 1);
  const end = rest.indexOf("\n## ", 3);
  const section = end < 0 ? rest : rest.slice(0, end);
  const steps = [];
  for (const m of section.matchAll(/^(\d+)\. ([\s\S]*?)(?=^\d+\. |(?![\s\S]))/gm)) {
    steps.push({ n: Number(m[1]), text: m[2].replace(/\s+/g, " ") });
  }
  return steps;
}

// One subject per step. Each must appear in the hook line AND in the K13.md
// step of the same number, so a reordered or renamed step fails here.
const SUBJECTS = [
  /verify/i,
  /cost/i,
  /outcome/i,
  /roadblock/i,
  /meaning/i,
  /owner action/i,
  /next.command/i,
  /humor/i,
  /quick squeeze/i,
  /\bcut\b/i,
  /figure/i,
  /confidence/i,
  /gate/i,
];

test("k13 hook: the version is the version K13.md declares", () => {
  const m = k13.match(/^\*\*Version:\*\* (\d+\.\d+\.\d+)$/m);
  assert.ok(m, "K13.md has a Version line");
  assert.equal(K13_VERSION, m[1]);
  assert.ok(k13SessionText().startsWith(`K13 ${m[1]} `));
});

test("k13 hook: exactly thirteen steps, numbered 1 to 13, matching K13.md in order", () => {
  const std = standardSteps();
  assert.equal(std.length, 13, "K13.md lists thirteen steps");
  assert.deepEqual(std.map((s) => s.n), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.equal(K13_STEPS.length, 13);
  const lines = k13SessionText().split("\n").filter((l) => /^\d+\. /.test(l));
  assert.deepEqual(lines.map((l) => Number(l.split(".")[0])), std.map((s) => s.n));
  SUBJECTS.forEach((re, i) => {
    assert.match(K13_STEPS[i], re, `hook step ${i + 1} names ${re}`);
    assert.match(std[i].text, re, `K13.md step ${i + 1} names ${re}`);
  });
});

test("k13 hook: names no step count other than thirteen", () => {
  const counts = [...k13SessionText().matchAll(/\b(\w+) steps\b/gi)].map((m) => m[1].toLowerCase());
  assert.ok(counts.length > 0, "the text names its step count");
  for (const c of counts) assert.equal(c, "thirteen");
});

test("k13 hook: the cut step carries the voice and the ceilings K13.md sets", () => {
  const cut = K13_STEPS[9];
  assert.match(k13, /\| the opening \| 40 words \|/);
  assert.match(k13, /\| the body \| 400 words \|/);
  for (const part of ["simple words", "one idea per sentence", "correct grammar", "no hype word", "Opening 40 words", "body 400"]) {
    assert.ok(cut.includes(part), part);
  }
  // K13 4.1.0 sets no letter or sentence count, so the hook names none.
  assert.doesNotMatch(k13SessionText(), /\bletters?\b|sentence \d+ words|average sentence/i);
});

test("k13 hook: the humor and voice lines carry every stop the owner set", () => {
  const humor = K13_STEPS[7];
  assert.match(humor, /never on a number/);
  assert.match(k13, /Never attach a joke to a number/);
  for (const part of ["one dry joke", "money", "safety", "security", "privacy", "legal", "tax", "loss", "errors the user did not cause", "frustrated user"]) {
    assert.ok(humor.includes(part), part);
    assert.ok(k13.toLowerCase().includes(part.toLowerCase()), `K13.md carries "${part}"`);
  }
  assert.match(k13SessionText(), /calm adult explaining to a smart caveman\. Simple words, correct grammar, facts stay true\./);
  assert.match(k13, /calm adult explaining to a smart caveman/);
});

test("k13 hook: short, ASCII, no dash", () => {
  const text = k13SessionText();
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 120 && words <= 190, `about 150 words, got ${words}`);
  assert.ok(/^[\x0a\x20-\x7e]*$/.test(text), "ASCII only");
  // The ASCII check above already rules out an em or en dash; this catches
  // the two ASCII stand-ins K13 step 13 also fails.
  assert.doesNotMatch(text, / -- | - /);
});

test("k13 hook: the script prints the SessionStart JSON both hosts read, and exits 0", () => {
  const r = spawnSync(process.execPath, [join(pluginRoot, "hooks", "k13-session.mjs")], {
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out, hookOutput());
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.ok(out.hookSpecificOutput.additionalContext.length < 10000, "under the host cap");
});

test("k13 hook: wired as SessionStart for Claude Code and Codex", () => {
  const claude = JSON.parse(readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8"));
  const c = claude.hooks.SessionStart[0].hooks[0];
  assert.equal(c.type, "command");
  assert.equal(c.command, "node");
  assert.deepEqual(c.args, ["${CLAUDE_PLUGIN_ROOT}/hooks/k13-session.mjs"]);
  assert.ok(c.timeout <= 30);

  const codex = JSON.parse(readFileSync(join(pluginRoot, "hooks", "codex-hooks.json"), "utf8"));
  const x = codex.hooks.SessionStart[0].hooks[0];
  assert.equal(x.type, "command");
  assert.equal(x.args, undefined);
  assert.equal(x.command, 'node "${PLUGIN_ROOT}/hooks/k13-session.mjs"');
  assert.ok(x.timeout <= 30);

  assert.ok(existsSync(join(pluginRoot, "hooks", "k13-session.mjs")));
});

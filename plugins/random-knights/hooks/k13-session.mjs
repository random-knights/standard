// K13 session start hook, for Claude Code and Codex.
//
// At the start of a session this prints the K13 rules as JSON on stdout:
//   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}
// Both hosts add additionalContext to the model's context before the first
// prompt (Claude Code hooks reference; Codex hooks reference). Neither host
// lets a SessionStart hook block anything, and this one never tries.
//
// The text is short on purpose: one line per K13 step, all thirteen, in order.
// test/k13-session.test.mjs holds it to K13.md in this repository: the same
// version, exactly thirteen numbered steps, and each step naming the subject
// of the matching step in K13.md. It cannot drift without a red test.
//
// No network, no file read, no file write. Any failure prints nothing and
// exits 0, so a broken hook can never break a session.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const K13_VERSION = "4.0.0";

export const K13_STEPS = [
  "Verify state from real sources. Do not guess.",
  "Capture the cost of the answer.",
  "Outcome first, then method.",
  "Flag every roadblock plainly.",
  "Turn the cost into meaning, not raw numbers.",
  "Name the owner action: the exact click or command.",
  "Give the next command, with model and effort.",
  "Humor sparse, at most one joke, never on a number. Off for safety, money, loss, errors the user did not cause, and a frustrated user.",
  "Draft the quick squeeze.",
  "Cut to the limits: opening 40 words, body 400, word 12 letters, sentence 20 words, no hype word.",
  "Source every figure.",
  "State the confidence and what it rests on.",
  "Run the gate: no dashes, every claim checked.",
];

export const K13_VOICE =
  "Voice: write like a calm adult explaining to a smart caveman. Simple words, correct grammar, facts stay true.";

export function k13SessionText() {
  return [
    `K13 ${K13_VERSION} is on for this session. Follow all thirteen steps, in order, in every answer.`,
    ...K13_STEPS.map((s, i) => `${i + 1}. ${s}`),
    K13_VOICE,
    "Full text: https://standard.rand0m.ai/k13/v1/K13.md",
  ].join("\n");
}

export function hookOutput() {
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: k13SessionText(),
    },
  };
}

function samePath(a, b) {
  const norm = (p) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  return norm(a) === norm(b);
}

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  try {
    process.stdout.write(JSON.stringify(hookOutput()) + "\n");
  } catch {
    // Print nothing. A session must start whatever happens here.
  }
  process.exitCode = 0;
}

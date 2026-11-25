// Color on the short receipt. Color is paint over the plain text: it may never
// change a character, it is off wherever nobody asked for it, and nothing that
// is written to a file carries it.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  HOOK_COLOR_HOSTS,
  PLAIN,
  RECEIPT_RAMPS,
  colorMode,
  formatAccount,
  formatReceipt,
  formatResponseReceipt,
  hookColorMode,
  parseTranscript,
  receiptFor,
} from "../scripts/core.mjs";
import { fixture, fixtureText, hermeticEnv, runCli, tmpDir } from "./helpers.mjs";

const ESC = String.fromCharCode(27);
// eslint-disable-next-line no-control-regex
const SGR = /\u001b\[[0-9;]*m/g;
const strip = (text) => text.replace(SGR, "");

const MODES = [
  { depth: "truecolor", theme: "dark" },
  { depth: "truecolor", theme: "light" },
  { depth: "256", theme: "dark" },
  { depth: "256", theme: "light" },
];

function samples(color) {
  const receipt = receiptFor(parseTranscript(fixtureText("session-owner-sample.jsonl")));
  const account = { counted: receipt.session.counted, sessions: 1, since: "", linked: false };
  const empty = receiptFor(parseTranscript(""));
  return {
    receipt: formatReceipt(receipt, account, color),
    noAccount: formatReceipt(receipt, undefined, color),
    response: formatResponseReceipt(receipt.response, color),
    account: formatAccount(account, { sessions: 1, since: "2026-11-24T00:00:00.000Z" }, color),
    // No energy: the water cell is empty, so padding runs across it.
    empty: formatResponseReceipt(empty.response, color),
  };
}

// -- colorMode -------------------------------------------------------------------

test("colorMode: NO_COLOR wins over everything, AIEDS_COLOR=always included", () => {
  for (const extra of [{}, { AIEDS_COLOR: "always" }, { FORCE_COLOR: "1" }, { AIEDS_COLOR: "always", FORCE_COLOR: "3", COLORTERM: "truecolor" }]) {
    assert.equal(colorMode({ NO_COLOR: "1", ...extra }, true).depth, "none", JSON.stringify(extra));
  }
  // An empty NO_COLOR is not set (the no-color.org rule).
  assert.equal(colorMode({ NO_COLOR: "", AIEDS_COLOR: "always" }, false).depth, "256");
});

test("colorMode: auto needs a terminal and a TERM that is not dumb", () => {
  assert.deepEqual(colorMode({}, false), { depth: "none", theme: "dark" });
  assert.deepEqual(colorMode({}, true), { depth: "256", theme: "dark" });
  assert.equal(colorMode({ AIEDS_COLOR: "auto" }, true).depth, "256");
  assert.equal(colorMode({ TERM: "dumb" }, true).depth, "none");
  assert.equal(colorMode({ TERM: "xterm-256color" }, true).depth, "256");
  assert.equal(colorMode({ AIEDS_COLOR: "never" }, true).depth, "none");
  assert.equal(colorMode({ AIEDS_COLOR: "never", FORCE_COLOR: "1" }, true).depth, "none");
});

test("colorMode: always and FORCE_COLOR turn color on without a terminal; FORCE_COLOR=0 does not", () => {
  assert.equal(colorMode({ AIEDS_COLOR: "always" }, false).depth, "256");
  assert.equal(colorMode({ AIEDS_COLOR: "ALWAYS", TERM: "dumb" }, false).depth, "256");
  assert.equal(colorMode({ FORCE_COLOR: "1" }, false).depth, "256");
  assert.equal(colorMode({ FORCE_COLOR: "0" }, false).depth, "none");
  assert.equal(colorMode({ FORCE_COLOR: "" }, false).depth, "none");
});

test("colorMode: COLORTERM picks truecolor, AIEDS_THEME picks the light ramp", () => {
  assert.equal(colorMode({ COLORTERM: "truecolor" }, true).depth, "truecolor");
  assert.equal(colorMode({ COLORTERM: "24bit" }, true).depth, "truecolor");
  assert.equal(colorMode({ COLORTERM: "yes" }, true).depth, "256");
  assert.equal(colorMode({ COLORTERM: "truecolor" }, false).depth, "none");
  assert.equal(colorMode({ AIEDS_THEME: "light" }, true).theme, "light");
  assert.equal(colorMode({ AIEDS_THEME: "Light" }, false).theme, "light");
  assert.equal(colorMode({ AIEDS_THEME: "solarized" }, true).theme, "dark");
});

// -- paint -----------------------------------------------------------------------

test("paint: with no color asked for, every receipt is plain ASCII with no escape byte", () => {
  for (const color of [undefined, PLAIN, { depth: "none", theme: "light" }, { depth: "bogus", theme: "dark" }]) {
    for (const [name, text] of Object.entries(samples(color))) {
      assert.ok(!text.includes(ESC), `${name} has an escape byte`);
      // eslint-disable-next-line no-control-regex
      assert.match(text, /^[\x0a\x20-\x7e]*$/, `${name} is not ASCII`);
    }
  }
});

test("paint: stripping the color codes from every colored mode gives the plain text exactly", () => {
  const plain = samples();
  for (const color of MODES) {
    const painted = samples(color);
    for (const name of Object.keys(plain)) {
      assert.ok(painted[name].includes(ESC), `${name} ${color.depth} ${color.theme} has no color`);
      assert.equal(strip(painted[name]), plain[name], `${name} ${color.depth} ${color.theme}`);
    }
  }
});

test("paint: dark truecolor uses the brand orange; light truecolor uses the maroon and no orange", () => {
  const dark = samples({ depth: "truecolor", theme: "dark" }).receipt;
  assert.ok(dark.includes("38;2;255;65;36"), "the primary brand color is on the dark receipt");
  assert.ok(!dark.includes("38;2;114;56;72"));
  const light = samples({ depth: "truecolor", theme: "light" }).receipt;
  assert.ok(light.includes("38;2;114;56;72"), "the owner maroon is on the light receipt");
  for (const orange of ["255;65;36", "244;93;67", "233;120;98", "250;175;165"]) {
    assert.ok(!light.includes(orange), `light output carries ${orange}`);
  }
});

test("paint: the only colors are the eight ramp colors, as rgb or as their xterm numbers", () => {
  const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(";");
  for (const color of MODES) {
    const ramp = RECEIPT_RAMPS[color.theme];
    const allowed = new Set(
      color.depth === "truecolor" ? ramp.truecolor.map((hex) => `38;2;${rgb(hex)}`) : ramp.xterm.map((n) => `38;5;${n}`),
    );
    for (const [name, text] of Object.entries(samples(color))) {
      const seen = new Set();
      for (const m of text.matchAll(SGR)) {
        const code = m[0].slice(2, -1);
        if (code === "0") continue;
        const params = code.replace(/^1;/, "");
        assert.ok(allowed.has(params), `${name} ${color.depth} ${color.theme}: unexpected code ${code}`);
        seen.add(params);
      }
      // Energy, carbon, water and tree-time take the four ramp colors in order.
      if (name !== "empty") assert.equal(seen.size, 4, `${name} ${color.depth} ${color.theme}`);
    }
  }
  assert.deepEqual(RECEIPT_RAMPS.dark.truecolor, ["#ff4124", "#f45d43", "#e97862", "#faafa5"]);
  assert.deepEqual(RECEIPT_RAMPS.light.truecolor, ["#723848", "#87374d", "#9d3551", "#b23456"]);
});

test("paint: every span is closed by a reset, and padding sits outside the spans", () => {
  for (const color of MODES) {
    for (const [name, text] of Object.entries(samples(color))) {
      const where = `${name} ${color.depth} ${color.theme}`;
      const codes = [...text.matchAll(SGR)].map((m) => m[0]);
      assert.equal(codes.length % 2, 0, where);
      codes.forEach((code, i) => {
        if (i % 2 === 0) assert.notEqual(code, `${ESC}[0m`, `${where}: a reset opens a span`);
        else assert.equal(code, `${ESC}[0m`, `${where}: a span is not closed before the next one`);
      });
      // eslint-disable-next-line no-control-regex
      for (const m of text.matchAll(/\u001b\[[0-9;]*[1-9][0-9;]*m([^\u001b]*)\u001b\[0m/g)) {
        assert.ok(m[1].length > 0, `${where}: an empty span`);
        assert.equal(m[1], m[1].trim(), `${where}: padding inside a span: ${JSON.stringify(m[1])}`);
        assert.ok(!m[1].includes("\n"), `${where}: a span crosses a line`);
      }
      for (const line of text.split("\n")) assert.ok(!line.endsWith(" "), `${where}: trailing space`);
    }
  }
});

test("paint: figures are bold, column names are not, and the title word is one bold letter per span", () => {
  const text = samples({ depth: "truecolor", theme: "dark" }).receipt;
  const lines = text.split("\n");
  const title = [...lines[0].matchAll(/\u001b\[1;38;2;(\d+;\d+;\d+)m(.)\u001b\[0m/g)]; // eslint-disable-line no-control-regex
  assert.equal(title.map((m) => m[2]).join(""), "AiEDs");
  assert.equal(title[0][1], "255;65;36", "the title starts on the first ramp color");
  assert.equal(title[4][1], "250;175;165", "and ends on the last");
  assert.ok(lines[0].endsWith(" energy receipt"), "the rest of the title is in the terminal's own color");
  assert.ok(lines[1].includes(`${ESC}[38;2;255;65;36menergy${ESC}[0m`), "column names are colored, not bold");
  assert.ok(!lines[1].includes(`${ESC}[1;`));
  assert.ok(lines[2].includes(`${ESC}[1;38;2;255;65;36m~50 Wh${ESC}[0m`), "figures are bold");
  assert.ok(lines[2].startsWith("this response  "), "labels are plain");
  assert.ok(lines[6].includes(`${ESC}[1;38;2;255;65;36mabout 5 phone charges${ESC}[0m`));
  assert.ok(lines[6].includes(`${ESC}[1;38;2;244;93;67mabout 200 m of driving${ESC}[0m`));
  assert.ok(!lines[8].includes(ESC), "the basis line is plain");
});

// -- contrast --------------------------------------------------------------------

const channel = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const fromHex = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
// The 6x6x6 color cube of the xterm 256 palette (indexes 16 to 231).
const fromXterm = (n) => {
  const level = (i) => (i === 0 ? 0 : 55 + 40 * i);
  const i = n - 16;
  return [level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6)];
};

test("contrast: every light ramp color is at least 4.5:1 on white, every dark one on a dark terminal", () => {
  const white = [255, 255, 255];
  // A common dark terminal background (VS Code dark), rgb 30 30 30.
  const darkTerminal = [30, 30, 30];
  for (const hex of RECEIPT_RAMPS.light.truecolor) {
    assert.ok(contrast(fromHex(hex), white) >= 4.5, `${hex} on white is ${contrast(fromHex(hex), white).toFixed(2)}`);
  }
  for (const n of RECEIPT_RAMPS.light.xterm) {
    assert.ok(contrast(fromXterm(n), white) >= 4.5, `xterm ${n} on white is ${contrast(fromXterm(n), white).toFixed(2)}`);
  }
  for (const hex of RECEIPT_RAMPS.dark.truecolor) {
    assert.ok(contrast(fromHex(hex), darkTerminal) >= 4.5, `${hex} on a dark terminal is ${contrast(fromHex(hex), darkTerminal).toFixed(2)}`);
  }
  for (const n of RECEIPT_RAMPS.dark.xterm) {
    assert.ok(contrast(fromXterm(n), darkTerminal) >= 4.5, `xterm ${n} on a dark terminal is ${contrast(fromXterm(n), darkTerminal).toFixed(2)}`);
  }
});

// -- hooks and files -------------------------------------------------------------

test("hook color: no host is cleared for color, so every hook mode is plain", () => {
  assert.deepEqual(HOOK_COLOR_HOSTS, []);
  for (const host of ["claude", "codex", "grok", "copilot", "other", ""]) {
    assert.deepEqual(hookColorMode({ AIEDS_COLOR: "always", FORCE_COLOR: "1", COLORTERM: "truecolor" }, host), PLAIN, host);
    assert.deepEqual(hookColorMode({}, host), PLAIN, host);
  }
});

test("hook: the output has no escape byte, by default and with every color switch set", async () => {
  const dir = tmpDir();
  try {
    const input = JSON.stringify({ session_id: "00000000-0000-4000-8000-0000000000c1", transcript_path: fixture("session-owner-sample.jsonl") });
    for (const extra of [{}, { AIEDS_COLOR: "always" }, { FORCE_COLOR: "1", COLORTERM: "truecolor" }, { AIEDS_COLOR: "always", AIEDS_THEME: "light" }]) {
      for (const host of ["claude", "codex", "grok"]) {
        const r = await runCli(["hook", host], { env: hermeticEnv(dir, extra), input });
        assert.equal(r.code, 0);
        assert.ok(!r.stdout.includes(ESC) && !r.stdout.includes("\\u001b"), `${host} ${JSON.stringify(extra)}`);
        assert.match(JSON.parse(r.stdout).systemMessage, /^AiEDs energy receipt\n/);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("account command: plain into a pipe, colored when asked, and NO_COLOR beats AIEDS_COLOR=always", async () => {
  const dir = tmpDir();
  try {
    const env = hermeticEnv(dir);
    await runCli(["hook", "claude"], {
      env,
      input: JSON.stringify({ session_id: "00000000-0000-4000-8000-0000000000c2", transcript_path: fixture("session-owner-sample.jsonl") }),
    });
    const piped = await runCli(["account"], { env });
    assert.ok(!piped.stdout.includes(ESC), "a pipe is not a terminal");
    const always = await runCli(["account"], { env: { ...env, AIEDS_COLOR: "always", COLORTERM: "truecolor" } });
    assert.ok(always.stdout.includes(`${ESC}[1;38;2;255;65;36m`), always.stdout);
    assert.equal(strip(always.stdout), piped.stdout);
    const light = await runCli(["account"], { env: { ...env, AIEDS_COLOR: "always", COLORTERM: "truecolor", AIEDS_THEME: "light" } });
    assert.ok(light.stdout.includes(`${ESC}[1;38;2;114;56;72m`), light.stdout);
    assert.ok(!light.stdout.includes("255;65;36"));
    const indexed = await runCli(["account"], { env: { ...env, AIEDS_COLOR: "always" } });
    assert.ok(indexed.stdout.includes(`${ESC}[1;38;5;202m`), indexed.stdout);
    const off = await runCli(["account"], { env: { ...env, AIEDS_COLOR: "always", COLORTERM: "truecolor", NO_COLOR: "1" } });
    assert.equal(off.stdout, piped.stdout);
    const never = await runCli(["account"], { env: { ...env, AIEDS_COLOR: "never", FORCE_COLOR: "1" } });
    assert.equal(never.stdout, piped.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("receipt and usage commands follow the same switches", async () => {
  const dir = tmpDir();
  try {
    const on = hermeticEnv(dir, { AIEDS_COLOR: "always", COLORTERM: "truecolor" });
    const receipt = await runCli(["receipt", "--transcript", fixture("session-owner-sample.jsonl")], { env: on });
    assert.ok(receipt.stdout.includes(`${ESC}[1;38;2;255;65;36m~50 Wh${ESC}[0m`), receipt.stdout);
    const usage = await runCli(["usage", "--provider", "Other", "--model", "m", "--input", "1000", "--output", "100"], { env: on });
    assert.ok(usage.stdout.includes(`${ESC}[1;38;2;255;65;36m`), usage.stdout);
    const plain = await runCli(["receipt", "--transcript", fixture("session-owner-sample.jsonl")], { env: hermeticEnv(dir) });
    assert.ok(!plain.stdout.includes(ESC));
    assert.equal(strip(receipt.stdout), plain.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("files never carry color: the local log and the rk-receipts output stay plain with color forced on", async () => {
  const dir = tmpDir();
  try {
    const forced = { AIEDS_COLOR: "always", FORCE_COLOR: "1", COLORTERM: "truecolor" };
    const input = JSON.stringify({ session_id: "00000000-0000-4000-8000-0000000000c3", transcript_path: fixture("session-owner-sample.jsonl") });
    for (const format of ["", "rk-receipts"]) {
      const log = join(dir, `log ${format || "default"}.jsonl`);
      const r = await runCli(["hook", "claude"], {
        env: hermeticEnv(dir, { ...forced, AIEDS_RECEIPT_LOG: log, AIEDS_RECEIPT_LOG_FORMAT: format }),
        input,
      });
      assert.equal(r.code, 0);
      const body = readFileSync(log, "utf8");
      assert.ok(body.length > 0);
      assert.ok(!body.includes(ESC) && !body.includes("\\u001b"), `the ${format || "default"} log carries color`);
    }
    const lines = await runCli(["receipt", "--transcript", fixture("session-owner-sample.jsonl"), "--format", "rk-receipts"], {
      env: hermeticEnv(dir, forced),
    });
    assert.ok(lines.stdout.length > 0);
    assert.ok(!lines.stdout.includes(ESC) && !lines.stdout.includes("\\u001b"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

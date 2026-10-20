// The per-tool table is data (data/install-providers.json). These tests are the
// CI gate for it: the READMEs match the data, a tool marked Verified names a
// tested version and a fixture that exists, and the install lines agree with
// what `aieds install` prints.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TARGETS, loadData, problems, renderBlock, splice } from "../../../scripts/gen-install-table.mjs";
import { HOST_COMMANDS } from "../scripts/install.mjs";
import { CLIENT_VERSION } from "../scripts/syncclient.mjs";
import { TESTED_HOSTS } from "../scripts/hosts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const data = loadData();

test("providers: the data passes every rule", () => {
  assert.deepEqual(problems(data, repoRoot), []);
});

test("providers: exactly the five v1 tools", () => {
  assert.deepEqual(data.providers.map((p) => p.id), ["claude", "codex", "ollama", "grok", "copilot"]);
});

test("providers: the root, plugin and MCP READMEs match the data", () => {
  const block = renderBlock(data);
  for (const file of TARGETS) {
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    assert.equal(splice(text, block), text, `${file} differs; run node scripts/gen-install-table.mjs`);
  }
});

test("providers: a Verified tool without a tested version or a fixture is refused", () => {
  const broken = structuredClone(data);
  broken.providers[0].testedVersion = "";
  assert.ok(problems(broken, repoRoot).some((p) => /needs a testedVersion/.test(p)));
  const noFixture = structuredClone(data);
  delete noFixture.providers[1].fixture;
  assert.ok(problems(noFixture, repoRoot).some((p) => /needs a fixture/.test(p)));
  const missingFile = structuredClone(data);
  missingFile.providers[2].fixture = "plugins/random-knights/test/fixtures/does-not-exist.jsonl";
  assert.ok(problems(missingFile, repoRoot).some((p) => /does not exist/.test(p)));
  const status = structuredClone(data);
  status.providers[3].status = "works-for-me";
  assert.ok(problems(status, repoRoot).some((p) => /status must be/.test(p)));
});

test("providers: install lines agree with `aieds install` and the wording the owner asked for", () => {
  const by = Object.fromEntries(data.providers.map((p) => [p.id, p]));
  assert.deepEqual(by.claude.install, HOST_COMMANDS.claude.lines);
  assert.deepEqual(by.codex.install, HOST_COMMANDS.codex.lines);
  assert.deepEqual(by.ollama.install, ['npx @randomknights/aieds ollama --model <name> "<prompt>"']);
  assert.deepEqual(by.copilot.install, ["npx @randomknights/aieds install copilot"]);
  assert.ok(by.grok.install.includes("npx @randomknights/aieds receipt --last grok"));
});

test("providers: tested versions in the data are the versions pinned in code", () => {
  const by = Object.fromEntries(data.providers.map((p) => [p.id, p]));
  assert.equal(by.codex.testedVersion, TESTED_HOSTS.codex);
  assert.equal(by.grok.testedVersion, TESTED_HOSTS.grok);
  assert.equal(by.copilot.testedVersion, TESTED_HOSTS.copilot);
});

test("version: the sync client version is the plugin version in all three places", () => {
  const root = join(here, "..");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const claude = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8")).version;
  const codex = JSON.parse(readFileSync(join(root, ".codex-plugin", "plugin.json"), "utf8")).version;
  assert.equal(CLIENT_VERSION, pkg);
  assert.equal(pkg, claude);
  assert.equal(pkg, codex);
});

test("privacy copy: the README no longer says there is no network, and names the allowlist", () => {
  const readme = readFileSync(join(here, "..", "README.md"), "utf8");
  assert.doesNotMatch(readme, /No network access\. The plugin makes no request of any kind\./);
  assert.doesNotMatch(readme, /No telemetry\. Nothing is sent to Random Knights or anyone else\.\n- No files/);
  assert.match(readme, /Until you run `aieds connect`/);
  assert.match(readme, /allowlisted numbers/);
  for (const field of ["rid", "tsUtc", "tokensIn", "energyWh", "waterMl", "treeTimeMin", "agentId"]) {
    assert.ok(readme.includes(field), field);
  }
  const hooks = JSON.parse(readFileSync(join(here, "..", "hooks", "hooks.json"), "utf8"));
  assert.doesNotMatch(hooks.description, /no network, no telemetry/i);
});

test("water label: one name, AiEDs 2.5.0 with methodology section 2.6, in both READMEs", () => {
  for (const file of TARGETS) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /AiEDs 2\.6\b/, `${file} calls the water section a version`);
    const norm = file.replace(/\\/g, "/");
    if (!norm.endsWith("random-knights/README.md") && !norm.endsWith("mcp/README.md")) continue;
    assert.match(text, /methodology section 2\.6/);
  }
});

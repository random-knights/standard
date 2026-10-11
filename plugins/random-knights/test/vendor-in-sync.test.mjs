// Gate: the library copy this plugin ships is exactly what the repository's
// own library builds to. See scripts/sync-claude-plugin.mjs for why a copy
// exists at all. This test never writes: a gate that repairs what it checks
// cannot fail.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FILES, plan } from "../../../scripts/sync-claude-plugin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const repoRoot = resolve(pluginRoot, "..", "..");

test("the lib build exists (run: cd lib && npm install && npm run build)", () => {
  assert.ok(
    existsSync(join(repoRoot, "lib", "dist", "index.js")),
    "lib/dist is missing; the vendored copy cannot be checked",
  );
});

test("the vendored library, factor table and licences match the repository", () => {
  for (const row of plan()) {
    assert.ok(existsSync(row.to), `${row.dst} is missing; run scripts/sync-claude-plugin.mjs`);
    const have = readFileSync(row.to);
    assert.equal(
      Buffer.compare(have, row.want),
      0,
      `${row.dst} differs from ${row.src}; run: node scripts/sync-claude-plugin.mjs`,
    );
  }
  assert.equal(plan().length, FILES.length);
});

test("the vendored files carry no CR byte, so they are the same on every platform", () => {
  for (const [, dst] of FILES) {
    const bytes = readFileSync(join(pluginRoot, dst));
    assert.ok(!bytes.includes(0x0d), `${dst} contains a CR byte`);
  }
});

test("the vendored library reports the methodology the factor table declares", async () => {
  const lib = await import("../vendor/lib/dist/index.js");
  const table = JSON.parse(
    readFileSync(join(pluginRoot, "vendor", "spec", "v2", "aieds-factors.json"), "utf8"),
  );
  assert.equal(lib.METHODOLOGY_VERSION, table.methodologyVersion);
});

// DRAFT (CONTRIBUTE-SPEC 4.1 and 6.5, owner approval pending, not legally
// reviewed). consent-contribute.txt is the exact text `aieds contribute on`
// will print. The CLI lane imports it; nothing reads it yet. Changing the text
// changes what a person agrees to: update the digest below in the same change,
// and bump the consent version in the CLI when it exists.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(root, "consent-contribute.txt"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");
const DIGEST = "211a454a8ed56f1fd4a664bdd58f6b5cc8da7b9aeff809c052f5585295091f32";

test("consent text: pinned digest, ASCII, LF, no em or en dash, 78 columns", () => {
  assert.equal(createHash("sha256").update(text).digest("hex"), DIGEST);
  assert.ok(!/[^\x00-\x7f]/.test(text));
  assert.ok(!text.includes("\r"));
  for (const line of text.split("\n")) assert.ok(line.length <= 78, line);
  assert.ok(text.endsWith("Turn on contributing? [y/N]\n"));
});

test("consent text: says off by default, keeps the 8 day matching sentence whole, never says anonymous", () => {
  assert.match(text, /It is OFF unless you say yes\./);
  assert.ok(text.includes("For up to 8 days we hold them and can match\n  them to your account, only to stop double counting and to let you delete\n  them."));
  assert.ok(text.includes("A total is shown only when\n  at least 50 people are in it, and counts are rounded."));
  assert.ok(text.includes("cannot be taken out"));
  assert.ok(text.includes("You must be 13 or older."));
  assert.doesNotMatch(text, /anonymous/i);
});

test("README: the contribute section and the allowlist are present and match the consent text", () => {
  assert.ok(readme.includes("Nothing leaves your machine unless you run `aieds connect` (your own reports)\nor `aieds contribute on` (community totals). Each has its own consent, its own\ntoken file, and is off by default. With neither, the plugin makes no network\ncall. Set `AIEDS_SYNC=off` or `AIEDS_CONTRIBUTE=off` to block either."));
  assert.match(readme, /## Contribute to the community totals/);
  for (const field of ["schema", "day", "provider", "model", "host", "tokenSource", "responses", "tokensIn", "tokensOut", "cacheReadTokens", "aiedsModelVersion", "energyWh", "waterL", "treeTimeMin"]) {
    assert.ok(readme.includes("`" + field + "`"), field);
  }
  assert.ok(readme.includes("consent-contribute.txt"));
  assert.doesNotMatch(readme.slice(readme.indexOf("## Contribute to the community totals"), readme.indexOf("## The aieds command")), /anonymous/i);
});

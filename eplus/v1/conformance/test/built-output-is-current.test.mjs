// Gate: the COMMITTED JavaScript under eplus/v1/conformance/out is exactly what
// the committed TypeScript compiles to.
//
// WHY THIS EXISTS. The compiled output is committed on purpose: the consumer
// installs this package as a sha-pinned tarball and must not have to run tsc
// during a deploy, so there is no "prepare" script and nothing rebuilds the
// output at install time. That choice trades an install-time failure mode for a
// drift failure mode: someone edits src/ and forgets to rebuild, and every
// consumer silently keeps running the old checker while the source in the
// repository says something else. That is the same two-copies-of-one-rule
// condition owner decision D6 exists to stop, so it gets a gate rather than a
// convention.
//
// It rebuilds into a temporary directory and compares byte for byte. It never
// writes to out/: a gate that fixes the thing it is checking cannot fail.
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const conformanceDir = resolve(here, "..");
const repoRoot = resolve(conformanceDir, "../../..");
const committedOut = join(conformanceDir, "out");

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).replaceAll("\\", "/"));
  }
  return out;
}

test("the committed out/ is byte-identical to a fresh tsc build of src/", () => {
  const fresh = mkdtempSync(join(tmpdir(), "eplus-conformance-build-"));
  try {
    execFileSync(
      process.execPath,
      [
        join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
        "-p",
        conformanceDir,
        "--outDir",
        fresh,
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );
    const built = walk(fresh).sort();
    const committed = walk(committedOut).sort();
    assert.deepEqual(
      committed,
      built,
      "the committed out/ does not have the same file list as a fresh build; " +
        "run `npm run build` at the repository root and commit the result",
    );
    for (const rel of built) {
      assert.equal(
        readFileSync(join(committedOut, rel), "utf8"),
        readFileSync(join(fresh, rel), "utf8"),
        `${rel} in the committed out/ differs from a fresh build; run ` +
          "`npm run build` at the repository root and commit the result",
      );
    }
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});

test("the committed out/ has no CR byte, so it is the same on every platform", () => {
  for (const rel of walk(committedOut)) {
    const bytes = readFileSync(join(committedOut, rel));
    assert.ok(
      !bytes.includes(0x0d),
      `out/${rel} contains a CR byte; the build must emit LF`,
    );
  }
});

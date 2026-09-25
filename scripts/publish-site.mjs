// publish-site.mjs - the documented production publish, in order, or not at all.
//
// WHY THIS EXISTS
//
// CONTRIBUTING.md has always documented the right sequence:
//
//     node scripts/build-site.mjs
//     cd spec && npm test && cd ..
//     firebase deploy --only hosting:standard --project randomknights-xyz
//
// Three lines that must be run in order, by hand, by a person. On 2026-09-24
// only the third was run. `hosting:standard` publishes `.firebase/standard-
// site`, a gitignored build output, so the deploy re-shipped the tree built
// the previous evening, printed a hosting URL, and exited 0. AiEDs 2.4.0
// merged and the site kept serving 2.3.0. Nothing was broken. A step was
// skipped and the skip was invisible.
//
// This runs the same three steps as one command and stops at the first
// failure, so the deploy cannot happen on top of a stale or failing build.
// It changes no policy: production is still owner-only, still run by hand,
// still with owner credentials on the owner's machine. It is not wired to CI
// and holds no secret.
//
// Usage:
//   npm run publish:site           build, gate, deploy, then verify
//   npm run publish:site -- --dry  build and gate only, no deploy
//
// The verify step at the end re-reads the LIVE site and fails if what it
// serves is behind this checkout. That is the step whose absence let the
// silent no-op through.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");

function run(label, command, args, options = {}) {
  console.log(`\n=== ${label}`);
  console.log(`    ${command} ${args.join(" ")}`);
  // shell only where Windows needs it. npm and npx resolve through .cmd
  // shims and need a shell; node does not, and running process.execPath
  // through cmd breaks on the space in "C:\Program Files\nodejs".
  const needsShell = process.platform === "win32" && command !== process.execPath;
  const res = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: "inherit",
    shell: needsShell,
  });
  if (res.status !== 0) {
    console.error(`\nFAILED at: ${label}`);
    console.error("Nothing after this step ran. The site was not deployed.");
    process.exit(res.status ?? 1);
  }
}

run("1/4  Build the site tree", process.execPath, ["scripts/build-site.mjs"]);

// site-output.test.mjs rebuilds the tree and refuses if any served file is
// not byte-identical to its repo source. Running it AFTER the build is what
// makes the built tree trustworthy rather than merely present.
run("2/4  Gate the built tree", "npm", ["test"], { cwd: join(root, "spec") });

if (dry) {
  console.log("\n--dry: built and gated. Nothing deployed.");
  process.exit(0);
}

run("3/4  Deploy to production hosting", "npx", [
  "-y",
  "firebase-tools@14",
  "deploy",
  "--only",
  "hosting:standard",
  "--project",
  "randomknights-xyz",
  "--non-interactive",
]);

// Hosting can serve the previous object for a few seconds after a deploy, so
// the verify retries before it believes a mismatch.
console.log("\n=== 4/4  Verify the live site serves this checkout");
let ok = false;
for (let attempt = 1; attempt <= 5; attempt++) {
  const res = spawnSync(process.execPath, ["scripts/check-published-site.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (res.status === 0) {
    ok = true;
    break;
  }
  if (attempt < 5) {
    console.log(`    not serving it yet, retrying (${attempt}/5)`);
    await new Promise((r) => setTimeout(r, 10000));
  }
}

if (!ok) {
  console.error("\nDEPLOYED, BUT THE LIVE SITE IS STILL BEHIND THIS CHECKOUT.");
  console.error("Do not assume it will catch up. Check what was deployed.");
  process.exit(1);
}

console.log("\npublished, and the live site serves it.");

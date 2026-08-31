// Builds the static site for standard.rand0m.ai: a thin machine-artifact
// index, plus the artifact tree itself at the exact paths the schema's own
// $id promises.
//
// ARCHITECTURE (owner decision, encoded here, not revisited):
//   standard.rand0m.ai   MACHINE artifacts at versioned, permanent paths.
//                         Schemas, tables, the K13 level registry. Things
//                         pin to these URLs, so nothing here ever moves.
//   randomknights.xyz     HUMAN home. Spec pages, demos, get-started.
// This script builds the first. It links to the second; it does not
// duplicate it. A rendered, styled reading experience belongs on xyz, which
// already has one.
//
// PATH DERIVATION. The schema's own "$id" is the single source of truth for
// where AIEDS artifacts live. This script parses it rather than hardcoding a
// second copy of the path, so the two cannot drift apart:
//   https://standard.rand0m.ai/aieds/v2/aieds.schema.json
//                              ^^^^^^^^ this segment is derived, not typed
//
// Deliberately dependency-free (node:fs + node:path only), matching the
// convention already set by spec/examples/validate.mjs and xyz's
// scripts/render.mjs: this repo's build tooling should not need a
// node_modules to produce HTML.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(repoRoot, ".firebase", "standard-site");

function assertSafeOutput() {
  const expectedParent = resolve(repoRoot, ".firebase");
  const actual = resolve(outputRoot);
  if (actual !== resolve(expectedParent, "standard-site")) {
    throw new Error(`Unsafe output path: ${actual}`);
  }
}

function readJson(relPath) {
  return JSON.parse(readFileSync(join(repoRoot, relPath), "utf8"));
}

// Parses the versioned artifact directory ("aieds/v2") out of a schema $id,
// so the served layout and the identifier can never silently disagree.
function artifactDirFromId(id) {
  const url = new URL(id);
  const parts = url.pathname.split("/").filter(Boolean);
  parts.pop(); // drop the filename, keep the directory segments
  if (parts.length < 2) {
    throw new Error(`Cannot derive an artifact directory from $id: ${id}`);
  }
  return parts.join("/");
}

const schema = readJson("spec/aieds.schema.json");
const factors = readJson("spec/v2/aieds-factors.json");
const methodologyText = readFileSync(
  join(repoRoot, "spec", "methodology.md"),
  "utf8",
);
const methodologyVersionMatch = methodologyText.match(
  /\*\*Version:\*\*\s*([\d.]+)/,
);
if (!methodologyVersionMatch) {
  throw new Error("Could not read the AIEDS version out of methodology.md.");
}
const methodologyVersion = methodologyVersionMatch[1];
if (methodologyVersion !== factors.methodologyVersion) {
  throw new Error(
    `methodology.md declares ${methodologyVersion} but ` +
      `spec/v2/aieds-factors.json declares ${factors.methodologyVersion}. ` +
      `They must agree before the site can be built.`,
  );
}

const aiedsDir = artifactDirFromId(schema.$id); // "aieds/v2"
const HOST = "https://standard.rand0m.ai";
const XYZ = "https://randomknights.xyz";

// K13 is decided to join this repository under CC BY 4.0 (see LICENSE-DOCS),
// but whether it actually has is a FACT about the filesystem, not a flag a
// human sets and might forget to flip. Checked here, not asserted: the page
// renders K13 as live only once K13.md is really present at the proposed
// path, so a partial move (K13.md added but k13-levels.json not yet) also
// shows correctly rather than jumping straight to "fully published".
const K13_DIR = "k13/v1";
const k13MdPresent = existsSync(join(repoRoot, "K13.md"));
const k13LevelsPresent = existsSync(join(repoRoot, "canon", "k13-levels.json"));

const K13 = {
  name: "K13",
  version: "1.1.0",
  dir: K13_DIR,
  license: "CC BY 4.0",
  licenseHref: "/LICENSE-DOCS",
  xyzHref: `${XYZ}/k13/`,
  files: [
    { label: "K13.md", name: "K13.md", present: k13MdPresent },
    {
      label: "level registry",
      name: "k13-levels.json",
      present: k13LevelsPresent,
    },
  ],
};

const AIEDS = {
  name: "AIEDS",
  fullName: "AI Energy Disclosure Standard",
  version: methodologyVersion,
  dir: aiedsDir,
  xyzHref: `${XYZ}/aieds/`,
  artifacts: [
    {
      label: "JSON Schema",
      href: schema.$id,
      license: "Apache 2.0",
      licenseHref: "/LICENSE",
    },
    {
      label: "methodology",
      href: `${HOST}/${aiedsDir}/methodology.md`,
      license: "CC BY 4.0",
      licenseHref: "/LICENSE-DOCS",
    },
    {
      label: "coefficient tables",
      href: `${HOST}/${aiedsDir}/aieds-factors.json`,
      license: "CC BY 4.0",
      licenseHref: "/LICENSE-DOCS",
    },
  ],
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Chrome values below are copied verbatim from rk_branding/canon/site-canon.md
// (Active, owner-directed, reference implementation randomknights.xyz), read
// fresh at authoring time rather than from a cached copy. Do not edit a value
// here without checking that file first; do not invent one that is missing
// from it. The edge glow is the ratified 2026-08-26 single-radial ramp, not
// the older three-stop version some older references still describe.
const CANON_CSS = `
:root {
  color-scheme: dark;
  --ink: #f6f3ed;
  --muted: #8e877d;
  --focus: #ff7a55;
  --xyz: #faafa5;
  --llc: #e97862;
  --org: #f45d43;
  --app: #ff4124;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: #0a0b08;
  color: var(--ink);
  font: 400 16px/1.5 ui-sans-serif, system-ui, sans-serif;
  min-height: 100vh;
  position: relative;
}
[tabindex]:focus-visible, a:focus-visible, button:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--focus);
  outline-offset: 3px;
}
.site-backdrop, .site-grid, .edge-glow {
  position: fixed;
  z-index: 0;
  inset: 0;
  pointer-events: none;
}
.site-backdrop {
  background-image:
    linear-gradient(180deg, rgba(8, 9, 7, 0.72), rgba(8, 9, 7, 0.94)),
    url("${XYZ}/assets/bg.png");
  background-position: center;
  background-size: cover;
}
.site-grid {
  background-image:
    repeating-linear-gradient(90deg, rgba(255, 124, 72, 0.18) 0 1px, transparent 1px 58px),
    repeating-linear-gradient(0deg, rgba(255, 124, 72, 0.14) 0 1px, transparent 1px 42px);
  mask-image: linear-gradient(0deg, #000 0%, rgba(0, 0, 0, 0.86) 18%, rgba(0, 0, 0, 0.34) 46%, transparent 72%);
}
@media (max-width: 760px) {
  .site-grid {
    background-image:
      repeating-linear-gradient(90deg, rgba(255, 124, 72, 0.16) 0 1px, transparent 1px 46px),
      repeating-linear-gradient(0deg, rgba(255, 124, 72, 0.12) 0 1px, transparent 1px 40px);
  }
}
.edge-glow {
  background-image:
    radial-gradient(66% 60% at 50% 36%, transparent 89%, rgba(255, 104, 54, 0.24) 100%);
  -webkit-mask-image: linear-gradient(0deg, #000 0%, #000 22%, rgba(0, 0, 0, 0.62) 36%, rgba(0, 0, 0, 0.22) 50%, transparent 66%);
  mask-image: linear-gradient(0deg, #000 0%, #000 22%, rgba(0, 0, 0, 0.62) 36%, rgba(0, 0, 0, 0.22) 50%, transparent 66%);
}
.page-shell {
  position: relative;
  z-index: 1;
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 24px 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
main { flex: 1; }
h1 { font-size: 28px; margin: 0 0 8px; }
.lede { color: var(--muted); margin: 0 0 40px; }
.standard {
  border: 1px solid rgba(255, 124, 72, 0.28);
  border-radius: 8px;
  padding: 20px 24px;
  margin-bottom: 24px;
}
.standard.unpublished { opacity: 0.6; }
.standard h2 { margin: 0 0 4px; font-size: 20px; }
.standard .version { color: var(--muted); font-size: 14px; margin: 0 0 14px; }
.standard .pending-note {
  font-size: 14px;
  color: var(--muted);
  margin: 0 0 14px;
}
.artifact-list { list-style: none; margin: 0 0 12px; padding: 0; }
.artifact-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 14px;
}
.artifact-list li:last-child { border-bottom: none; }
.artifact-list code { word-break: break-all; }
a { color: var(--app); text-decoration: none; }
a:hover, a:focus-visible { color: #ff7a55; }
.read-link { display: inline-block; margin-top: 4px; font-size: 14px; }
.license-tag {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.family-footer {
  position: relative;
  z-index: 1;
  padding: 24px 0 28px;
  font-size: 13px;
  color: var(--muted);
}
.family-footer a { text-decoration: none; }
.family-footer .family-link-xyz { color: var(--xyz); }
.family-footer .family-link-llc { color: var(--llc); }
.family-footer .family-link-org { color: var(--org); }
.family-footer .app-link { color: var(--app); }
`;

function artifactRow(a) {
  return `      <li>
        <a href="${escapeHtml(a.href)}"><code>${escapeHtml(a.label)}</code></a>
        <span class="license-tag"><a href="${escapeHtml(a.licenseHref)}">${escapeHtml(a.license)}</a></span>
      </li>`;
}

function aiedsSection() {
  const rows = AIEDS.artifacts.map(artifactRow).join("\n");
  return `    <section class="standard">
      <h2>${escapeHtml(AIEDS.fullName)}</h2>
      <p class="version">methodology ${escapeHtml(AIEDS.version)}</p>
      <ul class="artifact-list">
${rows}
      </ul>
      <a class="read-link" href="${escapeHtml(AIEDS.xyzHref)}">read the spec on randomknights.xyz -&gt;</a>
    </section>`;
}

function k13Section() {
  const allPresent = K13.files.every((f) => f.present);
  const rows = K13.files
    .map((f) =>
      f.present
        ? `      <li>
        <a href="${escapeHtml(`${HOST}/${K13.dir}/${f.name}`)}"><code>${escapeHtml(f.label)}</code></a>
        <span class="license-tag"><a href="${escapeHtml(K13.licenseHref)}">${escapeHtml(K13.license)}</a></span>
      </li>`
        : `      <li>
        <code>${escapeHtml(f.label)}</code>
        <span class="license-tag">not yet published</span>
      </li>`,
    )
    .join("\n");
  const note = allPresent
    ? ""
    : `      <p class="pending-note">
        Decided to join this repository under
        <a href="${escapeHtml(K13.licenseHref)}">${escapeHtml(K13.license)}</a>.
        ${escapeHtml(K13.files.filter((f) => !f.present).map((f) => f.label).join(" and "))}
        has not moved in yet; nothing marked "not yet published" below resolves
        until it lands.
      </p>\n`;
  return `    <section class="standard${allPresent ? "" : " unpublished"}">
      <h2>K13</h2>
      <p class="version">response standard ${escapeHtml(K13.version)}</p>
${note}      <ul class="artifact-list">
${rows}
      </ul>
      <a class="read-link" href="${escapeHtml(K13.xyzHref)}">read the standard on randomknights.xyz -&gt;</a>
    </section>`;
}

function renderIndexHtml() {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>standard.rand0m.ai</title>
<meta name="description" content="Machine artifacts for the standards Random Knights publishes: schemas, methodology, and reference tables at permanent versioned URLs.">
<style>${CANON_CSS}</style>
</head>
<body>
<div class="site-backdrop"></div>
<div class="site-grid"></div>
<div class="edge-glow"></div>
<div class="page-shell">
<main>
<h1>standard.rand0m.ai</h1>
<p class="lede">
  Machine artifacts for the standards Random Knights publishes. Schemas,
  methodology text, and reference tables, at permanent versioned URLs that do
  not move. For the rendered, readable documentation, go to
  <a href="${XYZ}/">randomknights.xyz</a>.
</p>
${aiedsSection()}
${k13Section()}
</main>
<footer class="family-footer">
  <a class="family-link-xyz" href="${XYZ}/">&#7450;k.xyz</a>
  &#183;
  <a class="family-link-llc" href="https://randomknights.llc/">&#7450;k.llc</a>
  &#183;
  <a class="family-link-org" href="https://randomknights.org/">&#7450;k.org</a>
  &#183;
  <a class="app-link" href="https://rand0m.ai/">rand0m.ai</a>
</footer>
</div>
</body>
</html>
`;
}

export function expectedFiles() {
  const files = new Map([
    ["index.html", Buffer.from(renderIndexHtml())],
    [
      join(aiedsDir, "aieds.schema.json"),
      readFileSync(join(repoRoot, "spec", "aieds.schema.json")),
    ],
    [
      join(aiedsDir, "methodology.md"),
      readFileSync(join(repoRoot, "spec", "methodology.md")),
    ],
    [
      join(aiedsDir, "aieds-factors.json"),
      readFileSync(join(repoRoot, "spec", "v2", "aieds-factors.json")),
    ],
    ["LICENSE", readFileSync(join(repoRoot, "LICENSE"))],
    ["LICENSE-DOCS", readFileSync(join(repoRoot, "LICENSE-DOCS"))],
  ]);
  if (k13MdPresent) {
    files.set(join(K13_DIR, "K13.md"), readFileSync(join(repoRoot, "K13.md")));
  }
  if (k13LevelsPresent) {
    files.set(
      join(K13_DIR, "k13-levels.json"),
      readFileSync(join(repoRoot, "canon", "k13-levels.json")),
    );
  }
  return files;
}

export function writeSite() {
  assertSafeOutput();
  rmSync(outputRoot, { recursive: true, force: true });
  for (const [name, bytes] of expectedFiles()) {
    const destination = join(outputRoot, name);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  writeSite();
  console.log(`standard.rand0m.ai site rendered to ${outputRoot}`);
  console.log(`AIEDS artifacts served from /${aiedsDir}/`);
  const k13Status = K13.files.every((f) => f.present)
    ? "published"
    : `pending (${K13.files.filter((f) => !f.present).map((f) => f.label).join(", ")} not present)`;
  console.log(`K13 artifacts at /${K13.dir}/: ${k13Status}`);
}

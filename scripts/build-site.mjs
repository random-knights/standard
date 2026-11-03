// Builds the static site for standard.rand0m.ai: a thin machine-artifact
// index, plus the artifact tree itself at the exact paths the schema's own
// $id promises.
//
// ARCHITECTURE (owner decision, encoded here, not revisited):
//   standard.rand0m.ai   MACHINE artifacts at versioned, permanent paths.
//                         Schemas, tables, the standards' text. Things
//                         pin to these URLs, so nothing here ever moves.
//   randomknights.xyz     HUMAN home. Spec pages, demos, get-started.
// This script builds the first. It links to the second; it does not
// duplicate it. A rendered, styled reading experience belongs on xyz, which
// already has one.
//
// PATH DERIVATION. The schema's own "$id" is the single source of truth for
// where AiEDs artifacts live. This script parses it rather than hardcoding a
// second copy of the path, so the two cannot drift apart:
//   https://standard.rand0m.ai/aieds/v2/aieds.schema.json
//                              ^^^^^^^^ this segment is derived, not typed
//
// Deliberately dependency-free (node:fs + node:path only), matching the
// convention already set by spec/examples/validate.mjs and xyz's
// scripts/render.mjs: this repo's build tooling should not need a
// node_modules to produce HTML.
import {
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
  throw new Error("Could not read the AiEDs version out of methodology.md.");
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

// ONE BRAND NAME PER PROPERTY. The bracketed form was REPLACED on
// 2026-09-23: Google brand verification rejected the bracketed letters, so
// the property name follows the owner-approved App Titles list and is now
// plain words. Block forms remain logo iconography only, with an exception
// for GitHub apps.
//
// The name is therefore pure ASCII and identical in both forms, so there is
// no entity to encode and no brand character to protect here. U+1D1A is
// still the sole brand-character exception to the ASCII rule and still
// ships as a numeric reference, but only in the family footer marks, which
// spec/test/build-site.test.mjs pins separately.
export const PROPERTY_NAME = "Standard by Random Knights";
export const PROPERTY_NAME_HTML = PROPERTY_NAME;
const XYZ = "https://randomknights.xyz";

// E+ has no schema yet, so its directory is a fixed path and its
// version is read out of the document's own header line. The document is
// served byte-identical; the version string on the index page is the one
// the text declares, never a flag set beside it.
const EPLUS_DIR = "eplus/v1";
const eplusText = readFileSync(
  join(repoRoot, "eplus", "v1", "methodology.md"),
  "utf8",
);
const eplusVersionMatch = eplusText.match(/\*\*Version:\*\*\s*([\d.]+)/);
if (!eplusVersionMatch) {
  throw new Error("Could not read the E+ version out of eplus/v1/methodology.md.");
}
const eplusStatusMatch = eplusText.match(/\*\*Status:\*\*\s*([^\n]+)/);
const EPLUS = {
  name: "E+",
  fullName: "E+ Earth + Ai Impact Standard",
  version: eplusVersionMatch[1],
  status: eplusStatusMatch ? eplusStatusMatch[1].trim() : "",
  dir: EPLUS_DIR,
  xyzHref: `${XYZ}/eplus/`,
  artifacts: [
    {
      label: "methodology",
      href: `${HOST}/${EPLUS_DIR}/methodology.md`,
      license: "CC BY 4.0",
      licenseHref: "/LICENSE-DOCS",
    },
  ],
};

const AIEDS = {
  name: "AiEDs",
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

function eplusSection() {
  const rows = EPLUS.artifacts.map(artifactRow).join("\n");
  // The status line is the document's own, so a draft never renders as
  // ratified on this page before it is ratified in the text.
  const status = EPLUS.status
    ? `      <p class="pending-note">${escapeHtml(EPLUS.status)}.</p>\n`
    : "";
  return `    <section class="standard">
      <h2>${escapeHtml(EPLUS.fullName)}</h2>
      <p class="version">methodology ${escapeHtml(EPLUS.version)}</p>
${status}      <ul class="artifact-list">
${rows}
      </ul>
      <a class="read-link" href="${escapeHtml(EPLUS.xyzHref)}">read the standard on randomknights.xyz -&gt;</a>
    </section>`;
}

const FAMILY_FOOTER = `<footer class="family-footer">
  <a class="family-link-xyz" href="${XYZ}/">&#7450;k.xyz</a>
  &#183;
  <a class="family-link-llc" href="https://randomknights.llc/">&#7450;k.llc</a>
  &#183;
  <a class="family-link-org" href="https://randomknights.org/">&#7450;k.org</a>
  &#183;
  <a class="app-link" href="https://rand0m.ai/">rand0m.ai</a>
</footer>`;

// TEMPORARY NOTICE AT AN OLD ADDRESS. Delete this notice, its entry in
// expectedFiles() and its test in spec/test/build-site.test.mjs on or after
// 2027-02-01.
//
// K13 was retired as a standard on 2026-11-03 and its files were removed from
// this repository, so nothing is served under k13/v1/ any more and those URLs
// return 404. The old address k13/ carries this one short page instead, so a
// reader who follows an old link learns what happened. Nothing else is built
// under k13/.
export const RETIRED_NOTICE_PATH = "k13/index.html";

function renderRetiredNoticeHtml() {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>K13 is retired | ${PROPERTY_NAME_HTML}</title>
<meta name="description" content="K13 has been retired as a standard. AiEDs and E+ continue.">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<style>${CANON_CSS}</style>
</head>
<body>
<div class="site-backdrop"></div>
<div class="site-grid"></div>
<div class="edge-glow"></div>
<div class="page-shell">
<main>
<h1>K13 is retired</h1>
<p>
  K13 has been retired as a standard. It was retired on 2026-11-03, and its
  text and files are no longer published.
</p>
<p>
  Two standards continue:
  <a href="${escapeHtml(AIEDS.xyzHref)}">${escapeHtml(AIEDS.name)}, the ${escapeHtml(AIEDS.fullName)}</a>,
  and <a href="${escapeHtml(EPLUS.xyzHref)}">${escapeHtml(EPLUS.name)}, the ${escapeHtml(EPLUS.fullName.replace(/^E\+ /, ""))}</a>.
  Their files are listed on the <a href="/">index page</a>.
</p>
</main>
${FAMILY_FOOTER}
</div>
</body>
</html>
`;
}

function renderIndexHtml() {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${PROPERTY_NAME_HTML}</title>
<meta name="description" content="Machine artifacts for the standards Random Knights publishes: schemas, methodology, and reference tables at permanent versioned URLs.">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<style>${CANON_CSS}</style>
</head>
<body>
<div class="site-backdrop"></div>
<div class="site-grid"></div>
<div class="edge-glow"></div>
<div class="page-shell">
<main>
<h1>${PROPERTY_NAME_HTML}</h1>
<p class="lede">
  Machine artifacts for the standards Random Knights publishes. Schemas,
  methodology text, and reference tables, at permanent versioned URLs that do
  not move. For the rendered, readable documentation, go to
  <a href="${XYZ}/">randomknights.xyz</a>.
</p>
${aiedsSection()}
${eplusSection()}
</main>
${FAMILY_FOOTER}
</div>
</body>
</html>
`;
}

// Served at the root, sourced from assets/icons/<same name>. Rendered from the
// RK mark (assets/icons is the only copy in this repo; the master lives with
// the brand assets).
export const FAVICON_FILES = [
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "site.webmanifest",
];

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
    [
      join(EPLUS_DIR, "methodology.md"),
      readFileSync(join(repoRoot, "eplus", "v1", "methodology.md")),
    ],
    ["LICENSE", readFileSync(join(repoRoot, "LICENSE"))],
    ["LICENSE-DOCS", readFileSync(join(repoRoot, "LICENSE-DOCS"))],
    // Served at the site ROOT, not under a versioned standard directory, on
    // purpose: it is the one artifact that answers "what version is each
    // standard right now" across all three, so it cannot live inside any one
    // of them. Consumers pin to https://standard.rand0m.ai/versions.json.
    [
      "versions.json",
      readFileSync(join(repoRoot, "spec", "v2", "standard-versions.json")),
    ],
    // The family mark as favicon, served at the site root like every other
    // family property. Sources live under assets/icons so the byte-identity
    // gate covers them like any served artifact.
    ...FAVICON_FILES.map((name) => [
      name,
      readFileSync(join(repoRoot, "assets", "icons", name)),
    ]),
    // Temporary: delete on or after 2027-02-01 (see RETIRED_NOTICE_PATH).
    [RETIRED_NOTICE_PATH, Buffer.from(renderRetiredNoticeHtml())],
  ]);
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
  console.log(`AiEDs artifacts served from /${aiedsDir}/`);
  console.log(
    `E+ methodology ${EPLUS.version} at /${EPLUS.dir}/ (${EPLUS.status || "no status line"})`,
  );
}

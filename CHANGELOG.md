# Changelog

Notable changes to this repository, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Version numbers here are AiEDs methodology versions, which follow semantic
versioning and are tagged `v<semver>`. The Claude Code and Codex plugin in
`plugins/random-knights` has its own version number; its changes are listed
under the AiEDs release they shipped in. E+ is a separate standard in this
repository, tagged `eplus-v<semver>`, and is not covered here.

This file starts at 2.5.0. The full rule-by-rule history of the standard,
back to 1.0.0, is the changelog table at the top of
[spec/methodology.md](spec/methodology.md). Every entry below comes from that
table, from the plugin's release notes in
[plugins/random-knights/README.md](plugins/random-knights/README.md), or from
the commit history. Numbers in parentheses are pull requests.

## [Unreleased]

### Added

- Plugin: `aieds receipt`, `aieds explain` and `aieds account` take `--json`
  and print one JSON object of unrounded numbers, with no color and no prose.
  `receipt --json` includes the session as a disclosure record that validates
  against `spec/aieds.schema.json`. No figure, coefficient or rounding rule
  changes, and the output without `--json` is the same as before.

## [2.5.1] - 2026-11-19

A patch to a label. No number changes, and records made under 2.0.0 through
2.5.0 remain valid.

### Changed

- The label for the default grid water figure is "US avg". It was "US
  average". This covers `gridBasisDefaultLabel` and the grid water note in
  `aieds-factors.json`, methodology section 2.6.5, rule W10 and test vector V7
  (#117, #120, #121).
- A requested region of "US avg" is read as the US average, the same as "US
  average", "US" or no region (#120).
- Plugin 0.7.2: the water line uses the new label and receipts name
  methodology 2.5.1 (#120).
- The npm package `@randomknights/aieds` is 2.5.1 (#120).
- The home page of standard.rand0m.ai was tidied (#119).
- Dependency updates in `mcp` and `spec`: hono, @hono/node-server,
  body-parser, zod, ip-address and fast-uri (#105, #106, #110, #111, #115,
  #118).

### Added

- Plugin 0.7.0: a shorter receipt with three scopes (this response, this
  session, your account), each with energy, carbon, water and tree-time at one
  significant figure. Cached text counts as free on the receipt. This follows
  methodology section 2.7, which is proposed and not ratified (#107, #108).
- Plugin 0.7.0: an account total kept on the user's own computer, with a
  command to show it and a command to reset it. It is never sent anywhere
  (#107).

### Removed

- K13, a response standard that lived in this repository, was retired on
  2026-11-03 and removed (#116).
- Plugin 0.7.1: the K13 session-start hook that plugin 0.7.0 had added (#109,
  #114).

### Fixed

- The plugin's transcript reader finds the first conversation record anywhere
  in a session file, not only on the first line (#113).

## [2.5.0] - 2026-10-18

A minor, additive release. No existing number changes, and records made under
2.0.0 through 2.4.0 remain valid. The version is dated 2026-10-18 in the
methodology and was tagged on 2026-10-23.

### Added

- Methodology section 2.6, Water, and Table 5. A disclosure may carry a
  modeled water figure: `waterL = energyKWh x (siteWUE + gridWaterIntensity)`,
  on a consumption basis, for inference only, always as a low to high range,
  with confidence `low` by rule.
- Water defaults: 0.36 L/kWh on site plus 4.52 L/kWh at the power plant (4.88
  L/kWh, range 1.77 to 11.3), from LBNL-2001637 (Shehabi et al. 2024), the US
  average.
- A third required sentence, "Water is a modeled estimate.", a list of words
  that must not appear in water copy, and conformance rules W1 to W11.
- The teaspoon (5 mL) as an educational comparison for water.
- An optional top-level `water` block in the schema. Records without it stay
  valid.
- Plugin 0.5.0: a water line on the receipt, from the same energy figure.
- Plugin 0.5.0: `aieds contribute on | off | status | preview | submit |
  delete`, an opt-in way to add daily summaries to community totals. It is off
  by default (#100).
- Plugin 0.5.0: a reader for Copilot CLI, installed with `aieds install
  copilot`.

### Changed

- Plugin 0.6.0: the receipt is up to four lines, not one paragraph. The
  water range, the full disclaimers and the unrounded figures moved to `aieds
  explain`. No factor or computed value changed (#103).

[Unreleased]: https://github.com/random-knights/standard/compare/v2.5.1...HEAD
[2.5.1]: https://github.com/random-knights/standard/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/random-knights/standard/compare/v2.4.0...v2.5.0

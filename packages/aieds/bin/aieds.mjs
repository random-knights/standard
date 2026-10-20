#!/usr/bin/env node
// The `aieds` command. The implementation is the one that ships in the Claude
// Code and Codex plugin (plugins/random-knights/scripts); the npm package
// carries a copy of it under src/cli, staged at pack time by
// scripts/stage-npm-package.mjs, so the two can never differ.
import { main } from "../src/cli/aieds.mjs";

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
});

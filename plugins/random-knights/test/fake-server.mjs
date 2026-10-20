// A local stand-in for the receipts sync backend, so the whole connect + hook +
// sync path can be tried before the real service (ruok PR 687) is deployed.
// It is the same fake the tests use: it approves the first poll, accepts any
// batch that passes the allowlist, counts duplicates, and prints one line per
// request. It stores nothing and listens on 127.0.0.1 only.
//
//   node plugins/random-knights/test/fake-server.mjs [--port 4799]
//
// then, in another terminal:
//   set AIEDS_CONFIG_DIR=%TEMP%\aieds-try      (PowerShell: $env:AIEDS_CONFIG_DIR = "$env:TEMP\aieds-try")
//   node plugins/random-knights/scripts/aieds.mjs connect --endpoint http://127.0.0.1:4799 --label try
import { startFakeServer } from "./helpers.mjs";

const i = process.argv.indexOf("--port");
const port = i >= 0 ? Number(process.argv[i + 1]) : 4799;
const server = await startFakeServer({
  port,
  onRequest: (path, body) => {
    const n = Array.isArray(body?.receipts) ? ` receipts=${body.receipts.length} host=${body.client?.host}` : "";
    console.log(`${new Date().toISOString()} ${path}${n}`);
  },
});
console.log(`fake sync backend on ${server.base} (Ctrl-C to stop)`);

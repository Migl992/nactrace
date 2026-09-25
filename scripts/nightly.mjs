#!/usr/bin/env node
// Nightly drift check (SPEC §7, Week 2). Live network use is intended here and only here.
//   1. web3_clientVersion of every EVM node (kernel/node version hint)
//   2. every pinned hash rebuilt live through the CLI and compared with fixtures/traces (e2e-live)
//   3. 0xTzKT OpenAPI per network diffed against the recorded fixtures/raw/<net>/xtzkt/openapi.json
//   4. field paths of the live 0xTzKT rows for the pinned hashes vs XTZKT_OBSERVED_FIELDS
// Writes a Markdown report (--report <file>), prints it, exits 1 on drift or failure.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NETWORKS, XTZKT_OBSERVED_FIELDS } from "../packages/core/dist/index.js";
import { fixtureRelPath } from "../packages/core/dist/node.js";
import { openapiDiff, openapiKeys, renderReport, rowFieldPaths, setDiff } from "./lib/drift.mjs";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const argv = process.argv.slice(2);
const reportArg = argv.indexOf("--report");
const reportPath = reportArg >= 0 ? argv[reportArg + 1] : undefined;
const hashes = JSON.parse(readFileSync(join(root, "fixtures/hashes.json"), "utf8"));
const networks = Object.keys(hashes);

const getJson = async (url) => {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
const rpc = async (url, method, params = []) => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((x) => x.json());
  if (r.error) throw new Error(r.error.message);
  return r.result;
};

// 1. node versions
const versions = {};
for (const net of networks) {
  try {
    versions[net] = await rpc(NETWORKS[net].evmRpc, "web3_clientVersion");
  } catch (e) {
    versions[net] = `unavailable (${e.message})`;
  }
}

// 2. live traces vs snapshots
const e2e = spawnSync(process.execPath, [join(root, "scripts/e2e-live.mjs")], {
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
const e2eOut = (e2e.stdout ?? "") + (e2e.stderr ?? "");
const totals = /(\d+) ok, (\d+) failing/.exec(e2eOut);
const traces = {
  pass: totals ? Number(totals[1]) : 0,
  fail: totals ? Number(totals[2]) : 1,
  output: e2eOut
    .split("\n")
    .filter((l) => !l.startsWith("ok "))
    .join("\n"),
};
if (!totals) traces.output = `e2e-live did not complete (exit ${e2e.status}):\n${e2eOut}`;

// 3. OpenAPI drift
const openapi = {};
for (const net of networks) {
  try {
    const recorded = JSON.parse(
      readFileSync(join(root, "fixtures/raw", net, "xtzkt/openapi.json"), "utf8"),
    );
    const live = await getJson(`${NETWORKS[net].xtzktApi}/v1/openapi.json`);
    openapi[net] = { ...openapiDiff(recorded, live), count: openapiKeys(live).length };
  } catch (e) {
    openapi[net] = { error: e.message };
  }
}

// 4. field-set drift: the same 0xTzKT requests the recorder made (pinned hashes + the two gateway
//    listings), recorded rows vs live rows. "Removed" then means a field really disappeared.
const fields = {};
for (const net of networks) {
  try {
    const api = NETWORKS[net].xtzktApi;
    const urls = [
      ...hashes[net].map(({ hash }) => `${api}/v1/operations/transaction?hash=${hash}`),
      ...["0xff00000000000000000000000000000000000007", "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw"].map(
        (gw) => `${api}/v1/operations/transaction?gateway.hash=${gw}&sort=id.desc&limit=20`,
      ),
    ];
    const recordedRows = [];
    const liveRows = [];
    for (const url of urls) {
      const rel = fixtureRelPath({ kind: "get", url });
      try {
        const rec = JSON.parse(readFileSync(join(root, "fixtures/raw", ...rel.split("/")), "utf8"));
        if (Array.isArray(rec)) recordedRows.push(...rec);
      } catch {
        /* not recorded (e.g. indexer lag at record time) */
      }
      const live = await getJson(url);
      if (Array.isArray(live)) liveRows.push(...live);
    }
    const live = rowFieldPaths(liveRows);
    const recorded = rowFieldPaths(recordedRows);
    const d = setDiff(recorded, live);
    // Fields the generated types never saw anywhere are the ones that matter for parsing.
    const known = new Set(XTZKT_OBSERVED_FIELDS);
    d.added = d.added.filter((p) => !known.has(p));
    fields[net] = { ...d, count: live.length };
  } catch (e) {
    fields[net] = { error: e.message };
  }
}

const { ok, markdown } = renderReport({
  date: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
  versions,
  traces,
  openapi,
  fields,
});
if (reportPath) writeFileSync(reportPath, markdown);
console.log(markdown);
process.exit(ok ? 0 : 1);

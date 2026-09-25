#!/usr/bin/env node
// Records every network response nactrace needs for the hashes in fixtures/hashes.json, through the
// real Provider in "record" mode, so unit tests can replay exactly the same requests offline.
// Layout is decided by FileFixtureStore (fixtures/raw/<network>/{xtzkt,evm,tezos}/…).
// Usage: node scripts/record-fixtures.mjs [--network previewnet|mainnet|all]
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  NETWORKS,
  Provider,
  detectNetwork,
  findOperation,
  getBlockHeader,
  getBlockOperations,
  getStorage,
  getTransaction,
  getTransactionReceipt,
  hexToNumber,
  isEvmTxHash,
  syntheticEvmTxHash,
  syntheticMichelsonOpHash,
  touchedContracts,
  traceTransaction,
} from "../packages/core/dist/index.js";
import { FileFixtureStore } from "../packages/core/dist/node.js";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const rawRoot = join(root, "fixtures/raw");
const arg = process.argv.indexOf("--network");
const wanted = arg > 0 ? process.argv[arg + 1] : "all";
const hashes = JSON.parse(readFileSync(join(root, "fixtures/hashes.json"), "utf8"));
const networks = wanted === "all" ? Object.keys(hashes) : [wanted];

for (const net of networks) rmSync(join(rawRoot, net), { recursive: true, force: true });

const provider = new Provider({
  mode: "record",
  store: new FileFixtureStore(rawRoot),
  onRequest: (req) =>
    process.stdout.write(
      `      ${req.kind === "rpc" ? req.method : "GET"} ${req.url.slice(0, 90)}\n`,
    ),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const net of networks) {
  console.log(`\n== ${net}`);
  // Network-wide documents used by the nightly schema diff.
  await provider.get(`${NETWORKS[net].xtzktApi}/v1/openapi.json`);
  for (const gw of [
    "0xff00000000000000000000000000000000000007",
    "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw",
  ]) {
    await provider.get(
      `${NETWORKS[net].xtzktApi}/v1/operations/transaction?gateway.hash=${gw}&sort=id.desc&limit=20`,
    );
  }

  for (const { hash, label } of hashes[net]) {
    console.log(`  - ${hash}  (${label})`);
    // Exactly what buildTrace() will do: ask every network, then enrich on the one that answered.
    const found = await detectNetwork(provider, hash);
    if (!found) {
      console.log("      !! 0xTzKT knows nothing about this hash");
      continue;
    }
    if (found.network !== net)
      console.log(`      !! detected on ${found.network}, expected ${net}`);
    const { rows } = found;
    const evmHash = isEvmTxHash(hash) ? hash : syntheticEvmTxHash(hash);
    const opHash = isEvmTxHash(hash) ? syntheticMichelsonOpHash(hash) : hash;

    const receipt = await getTransactionReceipt(provider, net, evmHash);
    await getTransaction(provider, net, evmHash);
    const trace = await traceTransaction(provider, net, evmHash);
    const level = rows[0]?.level ?? hexToNumber(receipt?.blockNumber);
    let opFound = false;
    let kt1s = [];
    if (level) {
      const passes = await getBlockOperations(provider, net, level);
      await getBlockHeader(provider, net, level);
      const op = findOperation(passes, opHash);
      opFound = Boolean(op);
      if (op) {
        kt1s = touchedContracts(op.contents);
        for (const kt1 of kt1s) {
          await getStorage(provider, net, kt1, level - 1);
          await getStorage(provider, net, kt1, level);
        }
      }
    }
    console.log(
      `      rows=${rows.length} [${rows.map((r) => r.direction).join(",")}] receipt=${receipt ? receipt.status : "none"} trace=${trace.frame ? "ok" : trace.error ? `error ${trace.error.code}` : "none"} level=${level} opInBlock=${opFound} kt1s=${kt1s.length}`,
    );
    await sleep(150);
  }
}
console.log(`\ndone: ${provider.sources.length} requests recorded under fixtures/raw`);

#!/usr/bin/env node
// Records raw 0xTzKT, EVM JSON-RPC and Tezos RPC responses for every hash in fixtures/hashes.json.
// Output is verbatim JSON under fixtures/raw/{xtzkt,rpc}/<network>/… plus a meta.json per hash with
// the URLs, fetch time, derived counterpart hashes and whether they matched what the chain returned.
// Usage: node scripts/record-fixtures.mjs [--network previewnet|mainnet|shadownet|all]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  NETWORKS,
  isEvmTxHash,
  syntheticEvmTxHash,
  syntheticMichelsonOpHash,
} from "../packages/core/dist/index.js";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const arg = process.argv.indexOf("--network");
const wanted = arg > 0 ? process.argv[arg + 1] : "all";
const hashes = JSON.parse(readFileSync(join(root, "fixtures/hashes.json"), "utf8"));

const fetchedAt = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function save(rel, data) {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, (typeof data === "string" ? data : JSON.stringify(data, null, 2)) + "\n");
}

async function getJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  try {
    return { status: r.status, body: JSON.parse(text) };
  } catch {
    return { status: r.status, body: text };
  }
}

async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return r.json();
}

/** Sorted, dotted list of every key path in a JSON value (arrays flattened). Used for schema diffs. */
function fieldPaths(v, prefix = "", out = new Set()) {
  if (Array.isArray(v)) for (const x of v) fieldPaths(x, prefix, out);
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.add(p);
      fieldPaths(x, p, out);
    }
  return [...out].sort();
}

function collectKt1s(blockOps) {
  const found = new Set();
  const visit = (c) => {
    for (const k of ["destination", "source"])
      if (typeof c?.[k] === "string" && c[k].startsWith("KT1")) found.add(c[k]);
    for (const i of c?.metadata?.internal_operation_results ?? []) visit(i);
    if (c?.result?.originated_contracts)
      for (const a of c.result.originated_contracts) found.add(a);
    if (c?.metadata?.operation_result?.originated_contracts)
      for (const a of c.metadata.operation_result.originated_contracts) found.add(a);
  };
  for (const c of blockOps) visit(c);
  return [...found];
}

async function recordNetwork(name) {
  const net = NETWORKS[name];
  const list = hashes[name] ?? [];
  console.log(`\n== ${name}: ${list.length} hashes`);

  // Network-wide documents: schema + the two gateway listings.
  const docs = {
    "openapi.json": `${net.xtzktApi}/v1/openapi.json`,
    "gateway_evm.json": `${net.xtzktApi}/v1/operations/transaction?gateway.hash=0xff00000000000000000000000000000000000007&sort=id.desc&limit=20`,
    "gateway_michelson.json": `${net.xtzktApi}/v1/operations/transaction?gateway.hash=KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw&sort=id.desc&limit=20`,
  };
  for (const [file, url] of Object.entries(docs)) {
    const { status, body } = await getJson(url);
    save(`fixtures/raw/xtzkt/${name}/${file}`, body);
    save(`fixtures/raw/xtzkt/${name}/${file.replace(/\.json$/, ".meta.json")}`, {
      url,
      status,
      fetchedAt,
    });
    console.log(`  ${file} ${status}`);
  }

  for (const { hash, label } of list) {
    console.log(`  - ${hash}  (${label})`);
    const meta = { hash, label, network: name, fetchedAt, sources: [], derived: {}, checks: {} };
    const evmHash = isEvmTxHash(hash) ? hash : syntheticEvmTxHash(hash);
    const opHash = isEvmTxHash(hash) ? syntheticMichelsonOpHash(hash) : hash;
    meta.derived = {
      evmHash,
      opHash,
      evmHashSynthetic: !isEvmTxHash(hash),
      opHashSynthetic: isEvmTxHash(hash),
    };

    // 0xTzKT rows
    const xUrl = `${net.xtzktApi}/v1/operations/transaction?hash=${hash}`;
    const x = await getJson(xUrl);
    save(`fixtures/raw/xtzkt/${name}/${hash}.json`, x.body);
    save(`fixtures/raw/xtzkt/${name}/${hash}.meta.json`, {
      url: xUrl,
      status: x.status,
      fetchedAt,
      xtzktSchemaObservedAt: fetchedAt,
      rows: Array.isArray(x.body) ? x.body.length : null,
      directions: Array.isArray(x.body) ? x.body.map((r) => r.direction) : null,
      fields: fieldPaths(x.body),
    });
    meta.sources.push({ url: xUrl, method: "GET" });
    const rows = Array.isArray(x.body) ? x.body : [];
    meta.checks.xtzktRows = rows.length;
    // Does 0xTzKT know the synthetic counterpart hash?
    const counterpart = isEvmTxHash(hash) ? opHash : evmHash;
    const xc = await getJson(`${net.xtzktApi}/v1/operations/transaction?hash=${counterpart}`);
    meta.checks.xtzktRowsForSyntheticCounterpart = Array.isArray(xc.body) ? xc.body.length : null;
    const level = rows[0]?.level;

    // EVM RPC
    const dir = `fixtures/raw/rpc/${name}/${hash}`;
    for (const [method, params] of [
      ["eth_getTransactionByHash", [evmHash]],
      ["eth_getTransactionReceipt", [evmHash]],
      ["debug_traceTransaction", [evmHash, { tracer: "callTracer" }]],
    ]) {
      const res = await rpc(net.evmRpc, method, params);
      save(`${dir}/evm.${method}.json`, res);
      meta.sources.push({ url: net.evmRpc, method, params });
      if (res.error) console.log(`      ${method}: error ${JSON.stringify(res.error)}`);
      if (method === "eth_getTransactionReceipt" && res.result) {
        meta.checks.evmReceiptFound = true;
        meta.checks.evmBlockNumber = parseInt(res.result.blockNumber, 16);
        meta.checks.evmStatus = res.result.status;
        meta.checks.gatewayTopic0s = res.result.logs
          .filter((l) => l.address.toLowerCase() === "0xff00000000000000000000000000000000000007")
          .map((l) => l.topics[0]);
      } else if (method === "eth_getTransactionReceipt") meta.checks.evmReceiptFound = false;
      await sleep(150);
    }

    // Tezos RPC at the level of the crossing (same numbering as the EVM block, verified on Previewnet)
    const lvl = level ?? meta.checks.evmBlockNumber;
    meta.checks.level = lvl;
    if (lvl) {
      const opsUrl = `${net.michelsonRpc}/chains/main/blocks/${lvl}/operations`;
      const ops = await getJson(opsUrl);
      save(`${dir}/tezos.block_operations.json`, ops.body);
      meta.sources.push({ url: opsUrl, method: "GET" });
      const flat = Array.isArray(ops.body) ? ops.body.flat() : [];
      const mine = flat.find((o) => o.hash === opHash);
      meta.checks.tezosOpFoundInBlock = Boolean(mine);
      meta.checks.tezosOpHashesInBlock = flat.map((o) => o.hash);
      const hdr = await getJson(`${net.michelsonRpc}/chains/main/blocks/${lvl}/header`);
      save(`${dir}/tezos.header.json`, hdr.body);
      if (mine) {
        save(`${dir}/tezos.operation.json`, mine);
        const kt1s = collectKt1s(mine.contents);
        meta.checks.touchedKt1s = kt1s;
        for (const kt1 of kt1s) {
          for (const at of [lvl - 1, lvl]) {
            const sUrl = `${net.michelsonRpc}/chains/main/blocks/${at}/context/contracts/${kt1}/storage`;
            const st = await getJson(sUrl);
            save(`${dir}/tezos.storage.${kt1}.${at}.json`, st.body);
            meta.sources.push({ url: sUrl, method: "GET" });
          }
        }
      }
    }
    save(`${dir}/meta.json`, meta);
    console.log(
      `      xtzkt rows=${meta.checks.xtzktRows} counterpartRows=${meta.checks.xtzktRowsForSyntheticCounterpart} receipt=${meta.checks.evmReceiptFound} status=${meta.checks.evmStatus} level=${lvl} opInBlock=${meta.checks.tezosOpFoundInBlock} kt1s=${(meta.checks.touchedKt1s ?? []).join(",")}`,
    );
    await sleep(200);
  }
}

for (const name of wanted === "all" ? Object.keys(hashes) : [wanted]) await recordNetwork(name);
console.log("\ndone");

#!/usr/bin/env node
// Tiny JSON-RPC proxy that lets `forge script` talk to an Etherlink node (docs/FINDINGS.md,
// "Foundry against Previewnet"): Foundry sends the fork block as a bare 32-byte block hash, which
// the node parses as a block number and rejects with `Z.Overflow`. This rewrites it to the
// EIP-1898 object form. Everything else is forwarded untouched.
//
//   node scripts/foundry-etherlink-shim.mjs [upstream-url] [port]
//   forge script … --rpc-url http://127.0.0.1:8545 --broadcast --skip-simulation
import http from "node:http";

const UP = process.argv[2] ?? "https://evm.previewnet.tezosx.nomadic-labs.com";
const PORT = Number(process.argv[3] ?? 8545);
const BLOCK_PARAM_METHODS = new Set([
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_call",
]);

function fix(req) {
  if (req && BLOCK_PARAM_METHODS.has(req.method) && Array.isArray(req.params)) {
    const i = req.params.length - 1;
    const p = req.params[i];
    if (typeof p === "string" && /^0x[0-9a-f]{64}$/i.test(p)) {
      req.params[i] = { blockHash: p, requireCanonical: false };
    }
  }
  return req;
}

http
  .createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    let out = body;
    try {
      const parsed = JSON.parse(body);
      out = JSON.stringify(Array.isArray(parsed) ? parsed.map(fix) : fix(parsed));
    } catch {
      /* not JSON: forward as is */
    }
    const r = await fetch(UP, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: out,
    });
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(await r.text());
  })
  .listen(PORT, () => console.log(`foundry-etherlink-shim: http://127.0.0.1:${PORT} -> ${UP}`));

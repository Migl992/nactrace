#!/usr/bin/env node
// nactrace-etherlink-shim: JSON-RPC proxy that lets `forge script` talk to an Etherlink node.
// Foundry sends the fork block as a bare 32-byte block hash in eth_getBalance / eth_getCode /
// eth_getTransactionCount; the Etherlink node parses that as a block number and answers
// `Z.Overflow` (docs/FINDINGS.md, "Foundry against Previewnet"). This rewrites the parameter to
// the EIP-1898 object form and forwards everything else untouched.
//
//   npx nactrace-etherlink-shim [upstream-url] [port]
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

interface RpcCall {
  method?: string;
  params?: unknown[];
}

export function rewrite(req: RpcCall): RpcCall {
  if (req && req.method && BLOCK_PARAM_METHODS.has(req.method) && Array.isArray(req.params)) {
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
      const parsed = JSON.parse(body) as RpcCall | RpcCall[];
      out = JSON.stringify(Array.isArray(parsed) ? parsed.map(rewrite) : rewrite(parsed));
    } catch {
      /* not JSON: forward as is */
    }
    try {
      const r = await fetch(UP, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: out,
      });
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(await r.text());
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: { code: -32000, message: `shim: ${(e as Error).message}` } }),
      );
    }
  })
  .listen(PORT, () => console.log(`nactrace-etherlink-shim: http://127.0.0.1:${PORT} -> ${UP}`));

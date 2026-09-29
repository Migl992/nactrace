# @nactrace/core

Library behind [nactrace](https://github.com/Migl992/nactrace), a debugger for cross-interface (NAC) calls on Etherlink / Tezos X. Give it a hash from either runtime and get a normalized `Trace` plus a one-sentence explanation of what happened and why it failed.

Pre-alpha. The 0xTzKT schema it reads is still evolving; unknown fields are tolerated, but expect changes.

```ts
import { buildTrace, Provider } from "@nactrace/core";

const trace = await buildTrace(
  "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716",
  {
    provider: new Provider(),
  },
);
console.log(trace.status); // "reverted"
console.log(trace.explanation.summary);
// EVM tx 0x3977…f716 from 0x2cad…87b3 to 0x0e11…4b3d calling 0x2baeceb7 reverted: Michelson entrypoint
// %decrement of KT1LT…5Tgv failed with FAILWITH "at zero"; whole transaction rolled back on both sides.
```

- Input: EVM tx hash, Tezos operation hash, or a Blockscout / TzKT / 0xTzKT URL. Network auto-detected (previewnet, mainnet, shadownet).
- Data: 0xTzKT first, then `eth_getTransactionReceipt`, `debug_traceTransaction` (callTracer) and the Michelson RPC for enrichment. `useXtzkt: false` forces the RPC-only path.
- Output: `Trace` (schema v1: tree of nodes with both gas units, decoded gateway events, revert reasons on both sides, storage before/after) and `explanation`.
- Browser-safe: depends only on `fetch`, `viem` and `@noble/hashes`. `@nactrace/core/node` adds a file-backed record/replay store for fixtures.

Also exported: the mirrored-hash recipe (`syntheticMichelsonOpHash`, `syntheticEvmTxHash`), the gateway event ABIs with their topic0, address classification and Michelson error parsing.

MIT

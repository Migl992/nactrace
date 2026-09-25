# nactrace

A debugger for cross-interface calls (NAC, Native Atomic Composability) on Etherlink / Tezos X.

Give it a hash from either side of a crossing and it tells you what happened and why it failed: which leg reverted, the decoded `Cross-runtime call failed with status 4xx: …` reason, the Michelson error, storage before/after, and gas per frame in both units.

Status: pre-alpha, under active development. See `docs/SPEC.md` for the full technical spec.

## Packages

| Package           | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `packages/core`   | `@nactrace/core`: pure TypeScript library, works in Node and the browser          |
| `packages/cli`    | `nactrace <hash>`: tree output, `--json`, `--explain-only`, exit code 1 on revert |
| `packages/hooks`  | Hardhat task `nactrace:last` and a Foundry post-test script                       |
| `packages/widget` | Embeddable `nactrace.js` script (`data-hash`, `data-network`)                     |

## Data sources

- [0xTzKT](https://api.xtzkt.io/) by Baking Bad, the primary source. It already indexes both legs of every crossing.
- Etherlink EVM JSON-RPC (`eth_getTransactionReceipt`, `debug_traceTransaction`) and the Michelson RPC, for enrichment and as a fallback when the indexer is down.

## Networks

| Network                     | EVM RPC                                          | Michelson RPC                                          | 0xTzKT                            |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------ | --------------------------------- |
| Previewnet (default in dev) | `https://evm.previewnet.tezosx.nomadic-labs.com` | `https://michelson.previewnet.tezosx.nomadic-labs.com` | `https://api.previewnet.xtzkt.io` |
| Mainnet                     | `https://node.mainnet.etherlink.com`             | `https://michelson.etherlink.mainnet.octez.io`         | `https://api.xtzkt.io`            |
| Shadownet                   | `https://node.shadownet.etherlink.com`           | `https://michelson.etherlink.shadownet.octez.io`       | `https://api.shadownet.xtzkt.io`  |

## Out of scope

nactrace is not an explorer. It has no web UI, no database, no indexing and no history. For those, use [0xTzKT](https://xtzkt.io/) or [Better Call Dev for Tezos X](https://tezosx.better-call.dev/). It does not sign transactions or manage wallets.

## Development

```
pnpm install
pnpm test        # offline, uses recorded fixtures under fixtures/raw/
pnpm lint
```

Unit tests never touch the network. Live checks run only in the nightly workflow.

## License

MIT

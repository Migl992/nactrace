# nactrace

A debugger for cross-interface calls (NAC, Native Atomic Composability) on Etherlink / Tezos X.

Give it a hash from either side of a crossing and it tells you what happened and why it failed: which leg reverted, the decoded `Cross-runtime call failed with status 4xx: …` reason, the Michelson error, storage before/after, and gas per frame in both units.

Status: pre-alpha (0.1.0 on npm), under active development. See `docs/SPEC.md` for the full technical spec and `docs/FINDINGS.md` for what the chain actually does.

## Quick start

```
npx nactrace 0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716
```

or `npm i -g nactrace`. Library: `npm i @nactrace/core`. Hooks: `npm i -D @nactrace/hooks`. From a checkout: `pnpm install && pnpm build && node packages/cli/dist/index.js <hash>`.

```
nactrace previewnet  REVERTED (atomic, both sides rolled back)

evm tx 0x3977…f716 0x2cad…87b3 → 0x0e11…4b3d 0x2baeceb7  [675409 gas]  ✗ reverted
   error: Cross-runtime call failed with status 400 Bad Request: Failed interpreting the Michelson contract …
└─ ↘ michelson crossing 0x0e11…4b3d → KT1LT…5Tgv %decrement  [30237 gas] mirrored opEnk…mSry  ✗ reverted
      michelson: Transfer(MichelsonContractInterpretError("runtime failure while running the script: failed with: String(\"at zero\") of type String"))
      storage: {"int":"0"} → {"int":"0"}

Why: EVM tx 0x3977…f716 from 0x2cad…87b3 to 0x0e11…4b3d calling 0x2baeceb7 reverted: Michelson entrypoint %decrement of KT1LT…5Tgv failed with FAILWITH "at zero"; whole transaction rolled back on both sides.
```

The input can be an EVM tx hash, a Tezos operation hash, or a Blockscout / TzKT / 0xTzKT URL. The network is detected through 0xTzKT.

## CLI

```
nactrace <hash|url> [options]
  -n, --network <name>   previewnet | mainnet | shadownet (default: auto-detect)
  -j, --json             full Trace JSON (schema in docs/SPEC.md §6)
  -e, --explain-only     only the one-sentence explanation
      --rpc-only         skip 0xTzKT, rebuild from the EVM and Tezos nodes (needs --network)
      --no-enrich        0xTzKT skeleton only
      --record <dir>     save every response (fixtures)      --replay <dir>  never touch the network
  -v, --verbose          full error strings                  --no-color
```

Exit codes: 0 success, 1 reverted or a caught cross-runtime failure, 2 usage or lookup error.

## Library

```ts
import { buildTrace, Provider } from "@nactrace/core";

const trace = await buildTrace("0x3977…f716", { provider: new Provider() });
console.log(trace.status, trace.explanation.summary);
```

`@nactrace/core` is browser-safe (fetch only). `@nactrace/core/node` adds the file-backed record/replay store.

## Widget

One script tag, no framework, about 28 kB gzipped:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@nactrace/widget@0.1/dist/nactrace.js"
  data-hash="0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716"
  data-network="previewnet"
></script>
```

It renders status, explanation, legs, errors, storage diff and links right after the tag. Also `nactrace.mount(element, { hash, network, theme })`. Demo page: `packages/widget/demo/index.html` (serve the package folder after `pnpm build`).

## Test-framework hooks

**Hardhat 3.** In `hardhat.config.ts`: `import nactrace from "@nactrace/hooks/hardhat";` and add it to `plugins: [nactrace]`. **Hardhat 2:** `import "@nactrace/hooks/hardhat2";`. Then, after a failed run on Previewnet:

```
npx hardhat nactrace:last --network previewnet        # last failed tx of the first configured account
npx hardhat nactrace:last --network previewnet --any  # last tx even if it succeeded
npx hardhat nactrace:last --hash 0x…                  # a specific hash or explorer URL
```

**Foundry.** After `forge script … --broadcast` on Previewnet, `nactrace-foundry` explains every transaction whose receipt failed (it reads `broadcast/**/run-latest.json`). It also takes hashes as arguments or from stdin:

```
nactrace-foundry                                      # failed txs of the latest broadcasts
nactrace-foundry --broadcast broadcast/Deploy.s.sol/128064/run-latest.json --all
forge test -vvvv 2>&1 | nactrace-foundry --stdin      # any hash printed by a test
```

`forge test` against a fork never lands transactions on chain, so there is nothing to explain there; use broadcast runs or print hashes from your tests. `forge script` against Etherlink needs `scripts/foundry-etherlink-shim.mjs` as RPC, `--skip-simulation`, and a fixed gas on calls expected to revert (see `docs/FINDINGS.md`).

## Packages

| Package           | Purpose                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `packages/core`   | `@nactrace/core`: Provider (cache, record/replay), adapters, `buildTrace`, `explain` |
| `packages/cli`    | `nactrace`: tree output, `--json`, `--explain-only`, exit code 1 on revert           |
| `packages/hooks`  | `@nactrace/hooks`: Hardhat task `nactrace:last`, `nactrace-foundry` script           |
| `packages/widget` | `@nactrace/widget`: embeddable `nactrace.js` (`data-hash`, `data-network`)           |

## Data sources

- [0xTzKT](https://api.xtzkt.io/) by Baking Bad, the primary source. It already indexes both legs of every crossing.
- Etherlink EVM JSON-RPC (`eth_getTransactionReceipt`, `debug_traceTransaction`) and the Michelson RPC, for enrichment and as a fallback when the indexer is down. The public mainnet node refuses `debug_traceTransaction` without an API key; nactrace then works from 0xTzKT rows and receipts and says so in `meta.warnings`.

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
pnpm test          # offline, replays fixtures/raw
pnpm lint
pnpm typecheck
pnpm fixtures:record   # re-record fixtures from Previewnet and mainnet (see fixtures/README.md)
```

Unit tests never touch the network. Live checks run only in the nightly workflow.

## Continuous integration

- `.github/workflows/ci.yml` runs lint, typecheck, build and the offline tests on every push and pull request.
- `.github/workflows/nightly.yml` runs `pnpm nightly` every day at 03:17 UTC (and on demand): it rebuilds every pinned hash live through the CLI and compares it with `fixtures/traces`, diffs the 0xTzKT OpenAPI documents and the field set of the recorded rows against the live networks, and logs the node versions. On drift it uploads the report and opens (or comments on) a GitHub issue labelled `nightly`; the issue is closed automatically once a night is green again.
- `pnpm e2e:live` runs only the trace comparison; `pnpm nightly` runs the whole check and writes `nightly-report.md`.

## License

MIT

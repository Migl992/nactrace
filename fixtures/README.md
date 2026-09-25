# fixtures

Recorded ground truth. Unit tests read only from here; nothing in `packages/` touches the network in tests.

## Layout

- `hashes.json` — the pinned hashes per network with a one-line label each. This is the input of the recorder.
- `previewnet.state.json` — addresses and hashes produced by the Previewnet setup scripts (regenerated after every Previewnet reset).
- `raw/xtzkt/<network>/` — verbatim 0xTzKT responses:
  - `<hash>.json` + `<hash>.meta.json` (url, status, `fetchedAt`, `xtzktSchemaObservedAt`, directions, sorted list of every field path seen)
  - `openapi.json`, `gateway_evm.json`, `gateway_michelson.json` (+ `.meta.json`)
- `raw/rpc/<network>/<hash>/` — verbatim RPC responses for the same crossing:
  - `evm.eth_getTransactionByHash.json`, `evm.eth_getTransactionReceipt.json`, `evm.debug_traceTransaction.json` (callTracer; on mainnet the public node refuses it and the error object is what gets saved)
  - `tezos.block_operations.json`, `tezos.header.json`, `tezos.operation.json` (the mirrored op, if found), `tezos.storage.<KT1>.<level>.json` for every touched KT1 at `level-1` and `level`
  - `meta.json` — sources, derived counterpart hashes and the cross-checks (receipt found, op found in block, gateway topic0s seen)
- `<network>.json` — expected `Trace` snapshots (added from Day 2).

## Regenerating

```
pnpm fixtures:record                      # all networks in hashes.json
node scripts/record-fixtures.mjs --network previewnet
```

After a Previewnet reset, first recreate the contracts and transactions (needs a funded `.env`, see `.env.example`):

```
pnpm previewnet:setup
```

Then copy the new hashes from `previewnet.state.json` into `hashes.json` and re-record. Commit with `chore(fixtures): re-record after previewnet reset`. Mainnet fixtures are permanent.

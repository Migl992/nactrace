# fixtures

Recorded ground truth. Unit tests read only from here; nothing in `packages/` touches the network in tests.

## Layout

- `hashes.json` — the pinned hashes per network with a one-line label each. Input of the recorder.
- `previewnet.state.json` — addresses and hashes produced by the Previewnet setup scripts (regenerated after every Previewnet reset).
- `raw/<network>/` — verbatim responses, one file per request, written by `FileFixtureStore` (`@nactrace/core/node`) while the real `Provider` runs in record mode. Every file has a `.meta.json` sidecar with the request, HTTP status and `fetchedAt` (which doubles as `xtzktSchemaObservedAt`).
  - `xtzkt/operations_transaction_hash_<hash>.json` — 0xTzKT rows for a hash (also recorded for the networks that answered `[]`, since network detection asks all of them)
  - `xtzkt/openapi.json`, `xtzkt/operations_transaction_gateway.hash_…json` — schema and gateway listings for the nightly diff
  - `evm/<method>.<hash>[.<digest>].json` — `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `debug_traceTransaction` (callTracer; the mainnet public node answers with an error object, recorded as-is)
  - `tezos/blocks_<level>_operations.json`, `blocks_<level>_header.json`, `blocks_<level>_context_contracts_<KT1>_storage.json` at `level-1` and `level` (a 404 is recorded too: the contract did not exist yet)
- `<network>.json` — expected `Trace` snapshots (from Day 3).

The replay side lives in `packages/core/src/test-utils/replay.ts`; a test that asks for something not recorded fails with `ProviderError: no fixture for …`.

## Regenerating

```
pnpm fixtures:record        # builds core, wipes raw/<network>, re-records, regenerates xtzkt.types.ts
```

After a Previewnet reset, first recreate the contracts and transactions (needs a funded `.env`, see `.env.example`):

```
pnpm previewnet:setup
```

Then copy the new hashes from `previewnet.state.json` into `hashes.json` and re-record. Commit with `chore(fixtures): re-record after previewnet reset`. Mainnet fixtures are permanent.

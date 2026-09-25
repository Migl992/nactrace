# fixtures

- `raw/xtzkt/` — verbatim 0xTzKT responses, one file per query, named `<network>.<hash-or-query>.json`.
- `raw/rpc/` — verbatim EVM JSON-RPC and Tezos RPC responses for the same hashes.
- `<network>.json` — known hashes with expected `Trace` snapshots (added from Day 2).

Every raw file carries a sibling `.meta.json` with `url`, `method`, `fetchedAt` and (for 0xTzKT) `xtzktSchemaObservedAt`.
Previewnet is reset from time to time; regenerate with `pnpm fixtures:record --network previewnet`. Mainnet fixtures are permanent.

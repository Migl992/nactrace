# nactrace — instructions for Claude Code

Read `docs/SPEC.md` fully before doing anything. It is the source of truth for scope, data sources, schema and plan. This file only adds working rules.

## What this project is

A NAC (cross-interface call) **debugger** for Etherlink / Tezos X. Not an explorer. Baking Bad's 0xTzKT already indexes both runtimes; we build on it and add the "why did it fail" layer: CLI, Foundry/Hardhat hooks, embeddable widget, nightly kernel-change CI.

## Hard rules

1. **Fetch before you type.** Before writing code against any RPC or 0xTzKT response, fetch a real one from Previewnet or mainnet and save it under `fixtures/raw/`. Never invent field names.
2. **0xTzKT first.** If a field exists in 0xTzKT, read it from there. EVM RPC and Tezos RPC are for enrichment (traces, revert data, storage diffs) and for the RPC-only fallback.
3. **Tolerant types.** 0xTzKT schema may gain fields for the next 1–2 months. Unknown fields must never break parsing.
4. **No network in unit tests.** Use recorded fixtures and the Provider record/replay mode. Live calls only in the nightly workflow.
5. **Stay in scope.** No web UI, no database, no indexing, no history. If something feels useful but is outside `SPEC.md §4`, add a line to `docs/ROADMAP.md` and move on.
6. **Log discrepancies.** When docs and observed behaviour disagree, trust the chain and write it in `docs/FINDINGS.md` with the hash that proves it.
7. **The product is `explain()`.** Prefer a better one-sentence root cause over prettier output.

## Stack

pnpm workspaces, TypeScript strict, `viem` (EVM), `@noble/hashes` (blake2b, keccak), plain `fetch` for 0xTzKT and Tezos RPC, vitest, tsup for bundles, conventional commits.

## Networks (defaults)

- Previewnet (default in dev): EVM `https://evm.previewnet.tezosx.nomadic-labs.com`, Michelson `https://michelson.previewnet.tezosx.nomadic-labs.com`, 0xTzKT `https://api.previewnet.xtzkt.io`
- Mainnet: EVM `https://node.mainnet.etherlink.com` (chain id 42793), Michelson `https://michelson.etherlink.mainnet.octez.io`, 0xTzKT `https://api.xtzkt.io`
- Shadownet: EVM `https://node.shadownet.etherlink.com` (chain id 127823), Michelson `https://michelson.etherlink.shadownet.octez.io`, 0xTzKT `https://api.shadownet.xtzkt.io`
- Gateways: EVM precompile `0xff00000000000000000000000000000000000007`, Michelson `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`

## Mirrored hashes

- EVM-originated: `michelson_op_hash = blake2b256("michelson" ++ evm_tx_hash_bytes)`
- Michelson-originated: `evm_tx_hash = keccak256("evm" ++ michelson_op_hash_bytes)`
  Golden vectors: `etherlink/kernel_latest/tezosx-journal/src/tezosx_journal.rs` in the tezos/tezos GitLab repo.

## Definition of done for a task

Tests pass offline, `pnpm lint` clean, `docs/FINDINGS.md` updated if you learned something about the chain, and a short note in the PR/commit describing what was verified against a real hash.

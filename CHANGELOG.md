# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Shadownet: six recorded crossings, snapshots and nightly coverage.
- `@nactrace/widget`: one-script-tag embeddable timeline and explanation (`data-hash`, `data-network`, `data-theme`, `data-enrich`, `data-target`; `nactrace.mount()`), about 28 kB gzipped.
- Nightly drift check (`pnpm nightly`, `.github/workflows/nightly.yml`): live traces vs recorded snapshots, 0xTzKT OpenAPI and field-set diffs, node versions; opens a GitHub issue on drift.
- `scripts/foundry-etherlink-shim.mjs`: JSON-RPC proxy that lets `forge script` talk to Etherlink nodes.

## [0.1.0] - 2026-09-25

First public release (pre-alpha).

### Added

- `@nactrace/core`: `Provider` with in-memory cache and record/replay, 0xTzKT / EVM / Tezos RPC adapters, `buildTrace()` (0xTzKT skeleton + receipt, callTracer and Tezos block enrichment, RPC-only fallback), `explain()`, mirrored-hash recipe verified against the kernel golden vectors, gateway event ABIs with topic0 confirmed on chain.
- `nactrace` CLI: tree output, `--json`, `--explain-only`, `--rpc-only`, `--level`, `--record` / `--replay`, exit code 1 on revert.
- `@nactrace/hooks`: Hardhat 3 plugin (`nactrace:last`), Hardhat 2 plugin, `nactrace-foundry` script for broadcast files, stdin and explicit hashes.
- Fixtures: 27 Previewnet and 5 mainnet crossings recorded verbatim (0xTzKT rows, receipts, traces, Tezos block operations, storage before/after), with expected traces for every one.
- `docs/FINDINGS.md`: observed chain behaviour and documentation discrepancies, each with the hash that proves it.

[Unreleased]: https://github.com/Migl992/nectrace/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Migl992/nectrace/releases/tag/v0.1.0

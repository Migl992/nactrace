# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.1] - 2026-09-28

### Fixed

- `@nactrace/core` 1.0.1 / `@nactrace/widget` 1.0.1: in browsers every request failed with "Illegal invocation" because `fetch` was called as a method of the Provider; found on the hosted page, invisible to Node-based tests. Regression test added; `scripts/e2e-browser.mjs` (Playwright) now checks the widget in a real Chromium.
- RPC-only lookup errors include the collected warnings (the underlying cause).

### Added

- Hosted page at https://migl992.github.io/nactrace/?hash=… (GitHub Pages, deployed by `.github/workflows/pages.yml`) with the widget demo under `/demo/`.

## [1.0.0] - 2026-09-28

First stable release: every deliverable of the v1 scope, verified against real crossings on Previewnet, mainnet and Shadownet.

### Added

- Shadownet: six recorded crossings, snapshots and nightly coverage.
- `@nactrace/widget`: one-script-tag embeddable timeline and explanation (`data-hash`, `data-network`, `data-theme`, `data-enrich`, `data-target`; `nactrace.mount()`), about 28 kB gzipped.
- Nightly drift check (`pnpm nightly`, `.github/workflows/nightly.yml`): live traces vs recorded snapshots, 0xTzKT OpenAPI and field-set diffs, node versions; opens a GitHub issue on drift.
- `nactrace-etherlink-shim` (in `@nactrace/hooks`) and `scripts/foundry-etherlink-shim.mjs`: JSON-RPC proxy that lets `forge script` talk to Etherlink nodes.
- `docs/SCHEMA.md`, `docs/hooks-hardhat.md`, `docs/hooks-foundry.md`; contributing, security and conduct files; issue and PR templates; release workflow; Dependabot.
- More recorded cases: caught revert, gas starvation, missing entrypoint/contract/view, malformed destination, multiple crossings, EVM-side reverts, callbacks, plain Michelson ops, per-leg hashes.

### Changed

- `explain()`: kernel error wrappers unwrapped (out of gas, typechecking, missing contract, user-account parameter), views, gateway rejections, callbacks, backtracked legs and deployments phrased explicitly.
- Hardhat plugins accept explorer URLs from any network; `nactrace-foundry` takes the network from the broadcast file.

## [0.1.0] - 2026-09-25

First public release (pre-alpha).

### Added

- `@nactrace/core`: `Provider` with in-memory cache and record/replay, 0xTzKT / EVM / Tezos RPC adapters, `buildTrace()` (0xTzKT skeleton + receipt, callTracer and Tezos block enrichment, RPC-only fallback), `explain()`, mirrored-hash recipe verified against the kernel golden vectors, gateway event ABIs with topic0 confirmed on chain.
- `nactrace` CLI: tree output, `--json`, `--explain-only`, `--rpc-only`, `--level`, `--record` / `--replay`, exit code 1 on revert.
- `@nactrace/hooks`: Hardhat 3 plugin (`nactrace:last`), Hardhat 2 plugin, `nactrace-foundry` script for broadcast files, stdin and explicit hashes.
- Fixtures: 27 Previewnet and 5 mainnet crossings recorded verbatim (0xTzKT rows, receipts, traces, Tezos block operations, storage before/after), with expected traces for every one.
- `docs/FINDINGS.md`: observed chain behaviour and documentation discrepancies, each with the hash that proves it.

[Unreleased]: https://github.com/Migl992/nactrace/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/Migl992/nactrace/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Migl992/nactrace/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/Migl992/nactrace/releases/tag/v0.1.0

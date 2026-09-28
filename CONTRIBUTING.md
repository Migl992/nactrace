# Contributing to nactrace

Thanks for helping. nactrace is small and opinionated; these rules keep it that way.

## Setup

```
pnpm install
pnpm build
pnpm test        # offline, replays fixtures/raw
pnpm lint
pnpm typecheck
```

Node 22 or newer and pnpm 10 (the repo pins the pnpm version through `packageManager`).

## Ground rules

1. **Fetch before you type.** Before writing code against any RPC or 0xTzKT response, record a real one from Previewnet or mainnet under `fixtures/raw/` (`pnpm fixtures:record`). Never invent field names. Types for 0xTzKT rows are generated from fixtures, not hand-written.
2. **0xTzKT first.** If a field exists in 0xTzKT, read it from there. The EVM and Tezos RPCs are for enrichment and for the RPC-only fallback.
3. **Tolerant types.** Unknown fields must never break parsing.
4. **No network in unit tests.** Tests replay fixtures through the `Provider` in replay mode. Live calls happen only in `pnpm nightly` and `pnpm e2e:live`.
5. **Stay in scope.** No web UI, no database, no indexing, no history. Useful ideas outside `docs/SPEC.md` §4 go into `docs/ROADMAP.md` as one line.
6. **Log discrepancies.** When the docs and the chain disagree, trust the chain and write it down in `docs/FINDINGS.md` with the hash that proves it.
7. **The product is `explain()`.** A better one-sentence root cause beats prettier output.

## Adding a case

1. Produce the transaction on Previewnet (see `scripts/previewnet/`), or find one on mainnet.
2. Add it to `fixtures/hashes.json` with a one-line label.
3. `pnpm fixtures:record` to record every request the library makes for it, then `pnpm test` to write its snapshot under `fixtures/traces/`.
4. Add an assertion on the explanation in `packages/core/src/trace-cases.test.ts`. If the sentence is wrong, fix `explain()`, not the test.
5. Note anything you learned about the chain in `docs/FINDINGS.md`.

After a Previewnet reset, rerun `pnpm previewnet:setup` with a funded `.env` (see `.env.example`), update the hashes, and commit as `chore(fixtures): re-record after previewnet reset`.

## Commits and pull requests

- Conventional commits: `feat(core): …`, `fix(cli): …`, `docs: …`, `chore(fixtures): …`.
- A pull request must pass `pnpm lint`, `pnpm typecheck` and `pnpm test` offline (CI runs them), and say what was verified against a real hash.
- Keep `@nactrace/core` free of Node-only APIs; Node-only helpers live under `packages/core/src/node/` and are exported from `@nactrace/core/node`.

## Releasing

Maintainers only. Bump versions, `pnpm build`, dry-run with `pnpm publish --dry-run --no-git-checks` in each package, then publish from an interactive terminal (npm requires a second factor on every publish). Tag `vX.Y.Z`; the release workflow creates the GitHub release and attaches the widget bundle.

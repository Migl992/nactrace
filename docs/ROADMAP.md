# ROADMAP

Ideas that are useful but outside `SPEC.md §4`. One line each. Nothing here is committed work.

- **Decode the gateway reason in `explain()`.** A failed `%call_evm` is on chain (`failed`), but its error message carries the ABI-encoded `Error(string)` mangled by `from_utf8_lossy`, and `Why:` currently prints the error id or the mangled bytes (`ooCc9yXP…`, `opL8Uf…`). Extract the readable reason (`boom from EVM`) instead. The same decoder would serve `nactrace --error '<message>'` for ops that Taquito refuses before injection.
- **Selector labels for EVM entrypoints.** Root tx lines show `calling 0xd09de08a`; a small 4-byte table (or 0xTzKT's `entrypoint` when it starts populating it for plain EVM rows) would print `increment()`.
- **Keyed mainnet RPC.** The public mainnet node refuses `debug_traceTransaction`; an `--evm-rpc <url>` override would restore per-frame gas and caught-revert detection on mainnet.

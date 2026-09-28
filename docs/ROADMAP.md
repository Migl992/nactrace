# ROADMAP

Ideas that are useful but outside `SPEC.md §4`. One line each. Nothing here is committed work.

- **Explain a simulation error.** A Michelson-originated crossing whose EVM leg reverts is never included in a block on Previewnet (observed 2026-09-25, 5 attempts); the failure only exists as the `tezlink_error` returned by preapply/run_operation, whose `error_message` carries the raw ABI-encoded `Error(string)` bytes. `nactrace --error '<message>'` could decode that string the same way it decodes on-chain reverts.
- **Selector labels for EVM entrypoints.** Root tx lines show `calling 0xd09de08a`; a small 4-byte table (or 0xTzKT's `entrypoint` when it starts populating it for plain EVM rows) would print `increment()`.
- **Keyed mainnet RPC.** The public mainnet node refuses `debug_traceTransaction`; an `--evm-rpc <url>` override would restore per-frame gas and caught-revert detection on mainnet.

# FINDINGS

Observed chain behaviour, with the hashes that prove it. When docs and the chain disagree, the chain wins and the discrepancy is logged here. Everything below was recorded on 2026-09-25 (Day 1) unless stated otherwise; raw responses live under `fixtures/raw/`.

## Previewnet accounts and contracts (Day 1)

- EVM `0x2caddB07Bb2893c85F48a58E9e605BDb96F787B3` and Tezos `tz1Tj26he8NbyEuiMGZerWUYCXNnzkvTA3Mh`, both funded to 30 XTZ from `https://faucet.previewnet.tezosx.nomadic-labs.com/`. The faucet page markup contains the text "Tezos faucet not configured on this deployment", yet the tz1 was funded fine.
- Previewnet EVM chain id `128064` (`0x1f440`). Michelson `chain_id` `NetXY2oPPzkxUW1`, protocol error ids are prefixed `proto.025-PsUshuai`. `web3_clientVersion`: `octez-evm-node 0.65 (0ee84d6b)` on Previewnet, `0.66 (9cfabac8)` on mainnet. Dashboard says Previewnet kernel v0.10 (2026-08-18).
- Michelson counter `KT1LT2vXbnTvjjsfZJQnArm21orXLsh95Tgv` (hand-written Michelson with a `get_counter` view, origination `ooZp91U71BwMi19EUDQPfbnodpNdFXe2GLTQSGZxRC4MPcTvQjj`, level 1046553).
- `EvmToMichelsonCounter` (tutorial contract, verbatim) at `0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d`; `CounterViewReader` at `0x5dae5f5c1f1be3b6b3fe5147ed88af185e872dd7`.
- Day 1 transactions (all in `fixtures/hashes.json`):
  - success `0x9480b2b38d6b1389cf553603bd81c3796c57e66b669b11f1bb0b00bc5b858bb1` (increment, level 1046559)
  - view `0x35ff4be8197f643b5243eecbe00459c18b58558a306a716bbf60b498acba7e50` (callMichelsonView via STATICCALL, level 1046560)
  - success `0x712fb54cb139a16e40885f60fb3c1026a284931af3326837685a625b8ad756ee` (decrement 1 → 0, level 1046561)
  - atomic revert `0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716` (decrement at zero, level 1046562)
  - Michelson-originated, nested `oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W` (tz1 → `KT18oDJ…` `%call_evm` → `increment()` → gateway → `KT1LT2…`, level 1046583)

### Toolchain quirks

- Taquito 25 default fee estimation is rejected by the Previewnet Michelson node: `evm_node.dev.insufficient_fees` (`current 0.001567, required 0.001786`). Pinning `fee` (4000 mutez for the origination, 6000 for the gateway call) works.
- Passing an explicit `gasLimit: 1_000_000` to a gateway call fails with `proto.025-PsUshuai.gas_limit_too_high`; letting Taquito estimate gas works (the applied op used `gas_limit` 7629).
- viem `writeContract` needs an explicit `gas` to submit the intentionally reverting call, since `eth_estimateGas` refuses it.
- The Git Bash `curl` on this machine fails TLS (exit 60) against these hosts; use Node `fetch`.

## Edge cases produced on Previewnet (Day 3, 2026-09-25)

`NacKitchenSink` at `0xb8a44c2e9148e0bc1996b6122f1aec43f7970908` (contracts/solidity/KitchenSink.sol), callback receiver `KT1QopYiQdyhkjn4mxUvC4u1ci6UzgE7mEDp`. All hashes are in `fixtures/hashes.json` with a label; the explanations they produce are asserted in `packages/core/src/trace-cases.test.ts`.

- **Caught revert** (`0x7db675…`): the contract calls the gateway with a low-level `call` and ignores `ok`. Receipt status `0x1`, the gateway frame has `error`, its parent has none, 0xTzKT (once indexed) shows the leg as failed. Storage untouched. This is the `partially_caught` status.
- **Gas starvation** (`0xbb967b…`, gateway called with 30000 gas): Michelson side reports `Transfer(OutOfGas(OutOfGas))` on the internal transaction; gateway string `Cross-runtime call failed with status 400 Bad Request: …`.
- **Missing entrypoint / ill-typed parameter / missing contract**: the Michelson error is a `MichelsonContractInterpretError("failed typechecking input: no such entrypoint: nope")`, `("failed typechecking input: value String(\"hi\") is invalid for type Unit")`, and `ContractDoesNotExist(Originated(ContractKt1Hash("KT1…")))` respectively. All three wrappers are unwrapped by `humanizeTezosMessage`.
- **Malformed destination** (`0xac0f43…`, `"KT1notARealAddress"`): the gateway rejects the call before anything crosses (`Invalid Tezos address in URL: …: invalid base58`, status 400). 0xTzKT returns two `x_evm` rows and **no** `x_evm_michelson` row; the Michelson block holds no mirrored op. The callTracer still shows the errored gateway frame, which is why frame/leg counts may legitimately differ.
- **Missing view** (`0xf51013…`): gateway status `404 Not Found: view "nope" not found on contract ContractKt1Hash("KT1…")`. 0xTzKT `output` on the failed `static_call` row holds the revert data, not a return value.
- **Three crossings in one tx** (`0x6f7f2b…`): three `x_evm_michelson` rows in `id` order, three `CrossRuntimeCallSent` logs, three internal transactions in the mirrored op, all `crossRuntimeCallId` = `1-0`.
- **Second crossing fails** (`0xbe234e…`): the first internal transaction is `backtracked` in the Tezos RPC (0xTzKT shows it `failed`), storage stays at its pre-tx value, receipt status `0x0`.
- **Callback** (`opLPk4…`): `%call_evm` with `Some(KT1Qop…)` produces, in the Tezos op, an internal `transaction` whose `source` is the Michelson gateway `KT18oDJ…` and whose parameter is the ABI-encoded return value; 0xTzKT shows it as an extra `x_michelson` row with `sender` = gateway. nactrace renders it as a `callback` node.
- **Plain Michelson op** (`ooGF66…`): a single `x_michelson` row, no synthetic EVM tx (`eth_getTransactionReceipt` of the derived hash is null, `debug_traceTransaction` errors with `-32603`).
- **Michelson-originated crossings whose EVM leg reverts never reach a block.** Five raw-injected operations calling `%call_evm` towards reverting targets (`boom()`, custom error, missing function, revert after a nested crossing, nested Michelson failure) were accepted by `injection/operation` but never included (hashes `opL8Uf…`, `onogc3…`, `ooZv1d…`, `opFyT2…`, `oohegN…`). Control experiments with the same code path: a **plain** failing Michelson op (`ooY5Ai…`, `%decrement` at zero) was included with status `failed`, and a raw-injected succeeding `%call_evm` (`onmRgg…`) was included. Simulation (`preapply`) of the failing ones returns `tezlink_error` with `Transfer(GatewayError("Cross-runtime call failed with status 400 Bad Request: <raw ABI-encoded Error(string) bytes>"))`. Consequence: for this direction there is no on-chain failure to debug; see `docs/ROADMAP.md`.
- **0xTzKT Previewnet lag**: at 15:09 UTC the indexer's newest row was level 1047225 while the chain head was 1047414 (about 19 minutes); 30 minutes later it was still at 1047225 with the head at 1047515, so this was a stall, not a lag. Three fixtures were recorded through the RPC-only path because of it; `buildTrace` takes a `level` option for op hashes that have no EVM leg to derive it from.
- **Raw injection on Tezos X**: `injection/operation` accepts a locally forged op (Taquito `LocalForger`, watermark `0x03`); `gas_limit` 120000 and fee 20000 mutez were accepted; `preapply` with a dummy signature is rejected with `Unexpected data (Signature.V3)`.

### Foundry against Previewnet (forge 1.8.3, 2026-09-25)

- `forge script` fails immediately with `failed to get account … Z.Overflow` (-32603): Foundry's fork backend passes the fork block as a **bare block hash** in `eth_getBalance` / `eth_getTransactionCount` / `eth_getCode` (`[addr, "0x0ad0…7b81"]`); the Etherlink node parses that as a block number and overflows. The EIP-1898 object form `{ "blockHash": … }` works. A 20-line rewriting proxy (`scripts/foundry-etherlink-shim.mjs`) makes `forge script` usable.
- Foundry's own simulation estimates the contract deployment at 878905 gas; the node refuses to send it: "insufficient to cover the transaction cost of 16405958 gas" (the deployment actually used 16972081). Use `--skip-simulation` so Foundry asks the node's `eth_estimateGas`.
- With node-side estimation, a call that will revert never gets broadcast: `eth_estimateGas` returns `-32005 execution reverted` whose `data` is the ABI-encoded gateway error (visible in the forge output as raw hex). Give the call a fixed gas in the script (`c.decrement{gas: 3_000_000}()`, `isFixedGasLimit: true` in the broadcast file) to land it on chain.
- When a broadcast transaction reverts, forge prints `Error: Transaction Failure: <hash>` and stops; `run-latest.json` records the failed tx with its `hash` but **no receipt**, and later transactions with `hash: null`. `nactrace-foundry` treats "hash without a successful receipt" as failed, and `--stdin` catches the hash from the forge output as well. Real file kept at `fixtures/foundry/run-latest.json` (hash `0x94e2a1…`, explained end to end).

## 0xTzKT

- OpenAPI document is at `/v1/openapi.json` (title "0xTzKT API v0.1.0", 65 paths, OpenAPI 3.1.1). `/v1/head` returns 404. Swagger UI paths from classic TzKT do not exist. Saved per network as `fixtures/raw/xtzkt/<network>/openapi.json`.
- `direction` enum (schema discriminator on `TransactionOperation`): `l1`, `x_evm`, `x_michelson`, `x_evm_michelson`, `x_michelson_evm`. Nothing else.
- `GET /v1/operations/transaction?hash=<h>` returns one row per leg with the same `hash`, exactly as SPEC §3.2 says. Observed leg sets:
  - EVM-originated crossing: `x_evm` (opType `dynamic_fee`, the top-level tx) + `x_evm_michelson` (opType `trace`, opCode `call`) — e.g. `0x9480b2…` on Previewnet, `0xc5e137…` on mainnet.
  - Michelson-originated crossing: `x_michelson_evm` (no `opType`/`opCode`; has `gatewayEntrypoint: "call_evm"`, decoded `gatewayParameters` with keys `string_0`, `string_1`, `bytes`, `contract`, plus `gatewayParametersRaw` Micheline) + one row per EVM-side internal call (`x_evm` `trace`), e.g. `opZX4Z…` on mainnet returns 4 rows.
  - Nested Michelson → EVM → Michelson (`oo3MFi…`): 2 rows, `x_michelson_evm` then `x_evm_michelson` whose `initiator` is the tz1 and whose `sender` is the EVM contract.
  - **View crossing** (`0x35ff4b…`): no `x_evm_michelson` row at all. The view shows up as an `x_evm` row with opType `trace`, opCode `static_call`, `target` = the gateway, `entrypoint: "callMichelsonView(string,string,bytes)"`, decoded `parameters` (`destination`, `viewName`, `input`) and `output`/`result` fields. The Michelson block for that level contains no mirrored op.
- Lookups only work by the **real** hash. Querying the synthetic counterpart (blake2b/keccak recipe below) returns `[]` for all 10 fixtures (`xtzktRowsForSyntheticCounterpart: 0` in every `meta.json`).
- Revert (`0x397704…`): both legs have `status: "failed"` and a string field `errors` holding the full gateway message: `Cross-runtime call failed with status 400 Bad Request: Failed interpreting the Michelson contract with runtime failure while running the script: failed with: String("at zero") of type String`.
- `gasUsed` on an `x_evm_michelson` row is **EVM gas of the gateway call frame**: 848010 on `0x9480b2…`, identical to the callTracer frame `gasUsed 0x0cf08a`. It is not milligas. On `x_michelson_evm` rows `gasUsed`/`gasLimit` are small integers (5284 / 7629) whose relation to the op's `consumed_milligas` (6507655) is not yet understood; `gasFee + daFee` (5048 + 952) equals the op fee in mutez (6000).
- Number types flip by direction: `amountSent`/`amountReceived` are string wei / integer mutez on `x_evm_michelson` rows and integer / string on `x_michelson_evm` rows. Parse both as strings.
- `alias` on a crossing row is the counterpart account of the **sender** (e.g. `KT1TA7PnMEKLeGgTLXZVk1QmeRoUSzUq3XK2` for the EVM contract, `0x926e29d5…` for the tz1). Account `type` values seen: `x_evm_user`, `x_evm_alias`, `x_evm_contract`, `x_michelson_user`, `x_michelson_alias`, `x_michelson_contract`.
- Filters behave like classic TzKT: `gateway.hash=`, `target.hash.ne=`, `sender.hash=`, `status=failed`, `sort=id.desc`, `limit=`, and `/v1/operations/transaction/count?…` all work (used by the Hardhat hook to find the last failed tx of an account). `anyof.sender.initiator.hash=` returns 400.
- Mainnet gateway rows are surprisingly few: 2 rows for the EVM gateway, 17 for the Michelson gateway (count endpoint, 2026-09-25). One mainnet EVM-originated crossing (`0xc5e137…`) uses the **generic** gateway entrypoint `call(string,(string,string)[],bytes,uint8)` with `gatewayParameters: {url: "http://tezos/tz1…", method: "1", headers: [], body: "0x"}`; the other (`0xf4f48c…`) uses `callMichelson(tz1…, "default", 0x)` with value. Most mainnet Michelson-originated rows target the withdrawal precompile `0xff…01` (`withdraw_base58` / `fast_withdraw_base58`).
- When the EOA calls the gateway **directly** (`0xf4f48c…`), 0xTzKT returns a single row: direction `x_evm_michelson` with opType `dynamic_fee`. The separate `x_evm` top-level row only exists when a contract sits between the EOA and the gateway. The trace builder must not assume an `x_evm` row.
- A crossing initiated by a KT1 alias (`onveDaSL…`): rows are `x_michelson` (tz1 → its KT1 alias, no gateway fields) then `x_michelson_evm` whose `sender` is the alias, `initiator` the tz1, `alias` the native 0x owner. The Michelson-side generic gateway entrypoint is named `call` (not `call_evm`) and its decoded params are `{string: "http://ethereum/0x…", list: [], bytes: "", nat: "1", contract: null}`.
- The mainnet and Previewnet OpenAPI documents differ slightly (65 vs 63 paths on 2026-09-25): the schema is deployed per network, so the nightly diff must compare each network against its own previous snapshot.
- Field paths observed across all 10 hash fixtures are listed in each `<hash>.meta.json` (`fields`). Union on Day 1: `alias, amount, amountReceived, amountSent, chain.{id,chainId,layer}, counter, daFee, direction, effectiveGasPrice, entrypoint, errors, gasFee, gasFeeRefunded, gasLimit, gasPrice, gasRefund, gasUsed, gateway, gatewayEntrypoint, gatewayInput, gatewayParameters.*, gatewayParametersRaw, guessed, hash, id, initiator, input, internalOperations, level, logsCount, maxFeePerGas, maxPriorityFeePerGas, nonce, opCode, opType, output, parameters.*, parametersRaw, result.{counter,recipient,response}, roundingLoss, sender, senderCodeHash, status, storageLimit, storageUsed, target, targetCodeHash, timestamp`.

## EVM RPC

- `debug_traceTransaction` with `callTracer` works on the public Previewnet endpoint and crosses the gateway boundary. On the public mainnet endpoint it is refused: `{"code":-32053,"message":"API key is not allowed to access method"}` (all 5 mainnet fixtures). Mainnet enrichment needs a keyed endpoint; the 0xTzKT rows must carry the trace on mainnet.
- Revert trace (`0x397704…`): both the outer frame and the gateway frame carry `error` = the full `Cross-runtime call failed with status 400 Bad Request: …` string and `output` = the ABI-encoded `Error(string)`. Receipt `status 0x0`, zero logs (the `CrossRuntimeCallSent` log is rolled back with the tx).
- View trace (`0x35ff4b…`): gateway frame is `STATICCALL` with `output` = ABI-encoded `(bytes)`; the decoded bytes for `nat 1` are `0x0001`.
- Michelson-originated crossings get a **synthetic EVM transaction** that is fully queryable: `eth_getTransactionByHash` returns `from == to == <EVM alias of the tz1>`, `input 0x`, `type 0x0`, `gasPrice 0x0`, `v/r/s 0x0`. Its callTracer trace starts with a call from `0x7e20580000000000000000000000000000000001` (the attribution address from SPEC §2, full value confirmed) to the alias, followed by alias → target. Proven on Previewnet `oo3MFi…` (synthetic `0x801d29202f645d48fef3d7265232354335c8a5013732553356a1984fd3d5d7a7`) and mainnet `opZX4Z…` (synthetic `0xb388b4be1d01367596cbbe893f35e5ceff1f1ab45076f38469cdad6a69f1ed8f`, block `0x32ed20a`).
- Alias RPCs from docs PR #459 exist on Previewnet: `tez_getTezosEthereumAddress("tz1Tj26…") = 0x926e29d5…` and `tez_getEthereumTezosAddress("0x2cadd…") = KT1Ru5fpQjhQRNDtpS3pj7USvYPTB4cfZoxS`.

## Tezos RPC

- Michelson block levels equal EVM block numbers. Every mirrored op was found at `/chains/main/blocks/<evm blockNumber>/operations` (9 of 9 non-view crossings, both networks).
- A block has 4 validation passes; crossings sit in the last one. The mirrored op of an EVM-originated tx has `fee`, `gas_limit`, `storage_limit`, `counter` all `"0"`, a `branch` and a `signature`, `source` = `tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU` (see aliases) and `destination` = the KT1 alias of the EVM sender.
- Internal operations of the mirrored op (`0x9480b2…`, first crossing of these accounts): `event` (tag `cross_runtime_call`, payload string `"1-0"`), two `origination`s (the KT1 aliases, ~2027661 milligas each), the actual `transaction` KT1 alias → `KT1LT2…` `%increment` (1020575 milligas, `storage {"int":"1"}`), then `event` (tag `cross_runtime_call_end`, payload `"1-0"`). Michelson-originated crossings emit the same pair of events with payload `"0-0"`.
- Revert (`0x397704…`): top-level `operation_result.status: "failed"` with **empty** `errors: []`; the real error sits on the internal transaction: `{"kind":"permanent","id":"tezlink_error","error_message":"Transfer(MichelsonContractInterpretError(\"runtime failure while running the script: failed with: String(\\\"at zero\\\") of type String\"))"}`. Surrounding `event` internals are `backtracked`.
- Storage diff via `/blocks/<level-1>/context/contracts/<KT1>/storage` vs `<level>`: counter `{"int":"0"}` → `{"int":"1"}` at 1046559.

## Events

Transcribed into `packages/core/src/events.ts` from the kernel sources and confirmed against real receipts:

| Event                                                             | Signature                                                                                                                                                     | topic0 (viem `toEventSelector`)                                      | Confirmed in                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `CrossRuntimeCallSent` (`runtime_gateway.rs`)                     | `CrossRuntimeCallSent(string crossRuntimeCallId, string targetRuntime, string targetAddress, uint256 amount)`                                                 | `0x63d7b3745d574412126b88bc586adea349b617cd75e87d47aff3dbc765bd834b` | Previewnet `0x9480b2…` receipt, log 0 from `0xff…07`                              |
| `CrossRuntimeCallReceived` (`tezosx-ethereum-runtime/src/lib.rs`) | `CrossRuntimeCallReceived(string crossRuntimeCallId, string sourceRuntime, string senderAddress, string sourceAddress, string targetAddress, uint256 amount)` | `0xfed9a84c1a0b3f03a08e089ccd124decdf96e24756f1963dbcef903c803d5b09` | mainnet synthetic receipt of `opZX4Z…`; Previewnet synthetic receipt of `oo3MFi…` |

- No field is indexed; both logs have a single topic and are emitted with `address = 0xff…07`.
- `crossRuntimeCallId` format is `<origin_runtime>-<tx_index>` (`CracId` in `tezosx_journal.rs`): `1-0` for an EVM-originated crossing, `0-0` for a Michelson-originated one. The same string is the payload of the Michelson `cross_runtime_call` / `cross_runtime_call_end` events, so it correlates the two sides.
- The gateway interface in the kernel also has a generic `call(string url, (string,string)[] headers, bytes body, uint8 method) returns (bytes)` entrypoint (selector `0xfa591a56`), `resolveAddress` and `originOf`. `callMichelson` selector is `0xa1544fc3`, `callMichelsonView` is `0x8326329c`.
- The docs page for EVM NAC usage does not mention the events; the Michelson-side `event` internal operations are documented nowhere.

## Mirrored hashes

Recipe from `tezosx_journal.rs`, implemented in `packages/core/src/hashes.ts` and unit-tested against the two golden vectors in that file (`parent = [1..32]`):

- `blake2b256("michelson" ++ parent)` = `9579…ccc5`, `keccak256("evm" ++ parent)` = `5e02…deb4`. Tests pass.
- Verified on chain: `syntheticMichelsonOpHash(0x9480b2…)` = `op7w99uHZNVjvQUz1YtWdWFADykSPzB3KEqrR7jd7SinogyCEtQ`, which is the op hash present in Previewnet block 1046559; same for the revert (`opEnkkJMcLqyuuVBfPC5neVFZ8mCYibXf8VqtP7MRvEBWNAmSry` at 1046562) and for all mainnet EVM-originated fixtures. `syntheticEvmTxHash(opZX4Z…)` = `0xb388b4be…` has a real receipt on mainnet.
- Operation hash base58check prefix is `[5, 116]` (`o…`, 51 chars).

## Aliases

Confirmed with `eth_call` on the gateway views (`resolveAddress`, `originOf`) and the `tez_*` RPCs:

- tz1 → EVM alias is `keccak256(utf8(base58))[0:20]` exactly as documented: `tz1Tj26…` → `0x926e29d504dc631e4e405925361392dbe7d25909` (offline computation matches `resolveAddress`, `tez_getTezosEthereumAddress` and the 0xTzKT `alias` field).
- KT1 → EVM alias is `Derived` too (`resolveAddress` res = 1): `KT1LT2…` → `0x52d42df5b96e22048ab8BDB408535ecAC1a99019`.
- EVM → Michelson aliases are `Recorded` KT1s (res = 0), originated inside the first crossing: EOA `0x2cadd…` → `KT1Ru5fpQjhQRNDtpS3pj7USvYPTB4cfZoxS`, contract `0x0e11…` → `KT1TA7PnMEKLeGgTLXZVk1QmeRoUSzUq3XK2`. `originOf(KT1…, 0)` returns kind 2 (Alias), home runtime 1 (EVM) and the native 0x address.
- `tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU` is a **native** Michelson account (`originOf` kind 1) used by the kernel as the source of every mirrored operation and of the `cross_runtime_call*` events. It is the Michelson counterpart of the EVM attribution address `0x7e2058…01`, which `originOf` reports as Unknown (kind 0). Both must be labelled `system` in `Trace.Address`.
- The EVM gateway `0xff…07` has no Michelson alias (`resolveAddress` classified = false).

## Discrepancies (docs vs chain)

1. **SPEC §3.5 / docs** say an EVM account's Michelson alias is "a KT1 created on first crossing". Confirmed for both EOAs and contracts (`KT1Ru5fp…`, `KT1TA7Pn…`), but note the mirrored op's `source` is not the alias but the system account `tz1Ke2h7…`; the alias is the `destination` of the top-level mirrored transaction and the `source` of the internal call.
2. **Docs EVM NAC page** documents only `callMichelson` / `callMichelsonView`; the kernel and 0xTzKT also expose the undocumented generic `call(string,(string,string)[],bytes,uint8)` on the EVM side (mainnet `0xc5e137…`) and `call` on the Michelson gateway (mainnet `onveDaSL…`).
3. **Docs endpoint-support page** says `debug_traceTransaction` is supported; on the public mainnet node it is gated behind an API key (`-32053`). Previewnet public node serves it.
4. **SPEC §3.2** lists `amountReceived (mutez)` as a number: true on `x_evm_michelson` rows but a string on `x_michelson_evm` rows.
5. **Faucet page** shows "Tezos faucet not configured on this deployment" but funding a tz1 worked.
6. **SPEC §5.2 / §5.3**: 0xTzKT does not resolve synthetic hashes, so the derived hash is useful for RPC lookups only, never for 0xTzKT queries. The RPC-only fallback must query the EVM node with the synthetic hash for Michelson-originated crossings (works, see EVM RPC section).

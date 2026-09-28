# Trace JSON, schema version 1

What `nactrace <hash> --json`, `buildTrace()` and the widget's `nactrace:trace` event give you. The TypeScript source of truth is `packages/core/src/types.ts`; this page explains the meaning. Fields marked _additive_ are not in the original spec and may be absent.

## Trace

| field                        | type                                          | meaning                                                                                                                |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`              | `"1"`                                         | bump only on breaking changes                                                                                          |
| `network`                    | `previewnet` \| `mainnet` \| `shadownet`      | where the hash was found                                                                                               |
| `root`                       | `Node`                                        | the transaction (EVM) or operation (Michelson) you asked about                                                         |
| `status`                     | `success` \| `reverted` \| `partially_caught` | `partially_caught`: the root succeeded but a cross-runtime leg reverted and the calling contract swallowed it          |
| `atomic`                     | boolean                                       | true when a failure rolled back both sides entirely (every `reverted` root)                                            |
| `explanation.summary`        | string                                        | the one sentence                                                                                                       |
| `explanation.failedNodeId`   | string?                                       | id of the deepest failed node                                                                                          |
| `explanation.evmReason`      | string?                                       | the decoded EVM-side reason, e.g. `Cross-runtime call failed with status 400 Bad Request: …`                           |
| `explanation.michelsonError` | object?                                       | the raw Tezos RPC error of the failed leg                                                                              |
| `meta.source`                | `xtzkt+rpc` \| `rpc_only`                     | whether 0xTzKT knew the hash                                                                                           |
| `meta.correlation`           | `xtzkt_hash` \| `derived_hash`                | how the two sides were linked                                                                                          |
| `meta.xtzktSchemaObservedAt` | ISO date?                                     | when the 0xTzKT rows were read                                                                                         |
| `meta.fetchedAt`             | ISO date                                      | build time (excluded from snapshot diffs)                                                                              |
| `meta.sources`               | `{url, method}[]`                             | every request made                                                                                                     |
| `meta.warnings`              | string[]                                      | _additive_. Anything that did not go to plan: a node down, a trace refused, a derived hash not found, … Never a crash. |

## Node

| field            | type                                                  | meaning                                                                                                                                               |
| ---------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string                                                | `n0`, `n1`, … stable within the trace                                                                                                                 |
| `runtime`        | `evm` \| `michelson`                                  | the runtime the node **executes in** (a `crossing` into Michelson has `runtime: michelson`)                                                           |
| `kind`           | see below                                             |                                                                                                                                                       |
| `hash`           | string?                                               | real hash for the root; on crossings, the hash of the mirrored tx/op on the other side                                                                |
| `synthetic`      | boolean?                                              | true when `hash` is derived (blake2b/keccak recipe), not a hash anyone submitted                                                                      |
| `from`, `to`     | `Address`                                             |                                                                                                                                                       |
| `entrypoint`     | string?                                               | Michelson entrypoint (`increment`), EVM signature (`increment()`) or selector (`0xd09de08a`)                                                          |
| `value`          | string?                                               | `"<amount> wei"` or `"<amount> mutez"`; `humanValue()` turns it into XTZ                                                                              |
| `gas`            | `{used?, limit?, unit}`                               | `unit`: `evm_gas` or `michelson_milligas`. On an EVM→Michelson crossing this is the EVM gas of the gateway frame                                      |
| `michelsonGas`   | `{used?, unit}`?                                      | _additive_. Milligas of the same leg on the Michelson side                                                                                            |
| `status`         | `success` \| `reverted` \| `backtracked` \| `skipped` | `backtracked`: applied, then rolled back because something later failed                                                                               |
| `error`          | string?                                               | decoded reason (gateway string, `FAILWITH …`, `boom from EVM`, `custom error 0x…`)                                                                    |
| `michelsonError` | object?                                               | _additive_. Raw Tezos RPC error (`kind`, `id`, `error_message`)                                                                                       |
| `output`         | string?                                               | _additive_. Decoded return data of a view                                                                                                             |
| `storageDiff`    | `{before, after}`?                                    | Michelson storage of `to` at level−1 and level; `before` is `null` when the contract was originated in this very operation                            |
| `events`         | `DecodedEvent[]`                                      | `CrossRuntimeCallSent` / `CrossRuntimeCallReceived` decoded (`crossRuntimeCallId`, …); Michelson `cross_runtime_call` events; other logs undecoded    |
| `children`       | `Node[]`                                              | execution order                                                                                                                                       |
| `links`          | `{blockscout?, tzkt?}`                                |                                                                                                                                                       |
| `raw`            | object?                                               | everything the conclusion was drawn from: the 0xTzKT row, receipt, call frame, Tezos internal operation; `caughtByCaller: true` on a swallowed revert |

### `kind`

| kind            | meaning                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `tx`            | root EVM transaction                                                                   |
| `op`            | root Michelson operation                                                               |
| `crossing`      | a call that crossed runtimes through a gateway; `runtime` is the target side           |
| `view`          | a read-only `callMichelsonView`; never has a Michelson-side operation                  |
| `call`          | an internal call that stayed in its runtime (e.g. the withdrawal precompile's helpers) |
| `callback`      | the return value of a `%call_evm` delivered to a Michelson contract by the gateway     |
| `alias_created` | a KT1 alias originated for an EVM account on its first crossing                        |

## Address

| field         | type                                                      | meaning                                                                  |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `value`       | string                                                    | `0x…`, `tz1…`, `KT1…`, or `?` when unknown                               |
| `runtime`     | `evm` \| `michelson`                                      | from the address format                                                  |
| `role`        | `native` \| `alias` \| `gateway` \| `system` \| `unknown` | `system`: the kernel's attribution accounts (`0x7e2058…01`, `tz1Ke2h7…`) |
| `counterpart` | string?                                                   | the alias on the other side when 0xTzKT knows it                         |
| `label`       | string?                                                   | `NAC gateway (EVM side)`, `alias of 0x…`, …                              |

## Example (abridged)

```json
{
  "schemaVersion": "1",
  "network": "previewnet",
  "status": "reverted",
  "atomic": true,
  "root": {
    "id": "n0",
    "runtime": "evm",
    "kind": "tx",
    "hash": "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716",
    "from": {
      "value": "0x2caddb07bb2893c85f48a58e9e605bdb96f787b3",
      "runtime": "evm",
      "role": "native"
    },
    "to": {
      "value": "0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d",
      "runtime": "evm",
      "role": "native",
      "label": "contract"
    },
    "entrypoint": "0x2baeceb7",
    "gas": { "used": "675409", "limit": "5000000", "unit": "evm_gas" },
    "status": "reverted",
    "error": "Cross-runtime call failed with status 400 Bad Request: … failed with: String(\"at zero\") of type String",
    "children": [
      {
        "id": "n1",
        "runtime": "michelson",
        "kind": "crossing",
        "hash": "opEnkkJMcLqyuuVBfPC5neVFZ8mCYibXf8VqtP7MRvEBWNAmSry",
        "synthetic": true,
        "to": {
          "value": "KT1LT2vXbnTvjjsfZJQnArm21orXLsh95Tgv",
          "runtime": "michelson",
          "role": "native",
          "label": "contract"
        },
        "entrypoint": "decrement",
        "gas": { "used": "30237", "unit": "evm_gas" },
        "status": "reverted",
        "michelsonError": {
          "kind": "permanent",
          "id": "tezlink_error",
          "error_message": "Transfer(MichelsonContractInterpretError(\"… failed with: String(\\\"at zero\\\") of type String\"))"
        },
        "storageDiff": { "before": { "int": "0" }, "after": { "int": "0" } }
      }
    ]
  },
  "explanation": {
    "summary": "EVM tx 0x3977…f716 from 0x2cad…87b3 to 0x0e11…4b3d calling 0x2baeceb7 reverted: Michelson entrypoint %decrement of KT1LT…5Tgv failed with FAILWITH \"at zero\"; whole transaction rolled back on both sides.",
    "failedNodeId": "n1"
  },
  "meta": { "source": "xtzkt+rpc", "correlation": "xtzkt_hash", "warnings": [] }
}
```

Full examples for every recorded crossing are under `fixtures/traces/<network>/`.

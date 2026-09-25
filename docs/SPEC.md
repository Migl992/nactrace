# nactrace — Technical analysis & implementation spec

> Cross-interface transaction inspector for Etherlink / Tezos X (Native Atomic Composability).
> Status: v0.2 spec, 25 Sep 2026. Supersedes v0.1 after the Discord answers from Baking Bad (0xTzKT indexes both runtimes; hash recipe and event sources provided). Written to be handed to Claude Code as the starting context.
> Language: TypeScript. License: MIT. Solo builder, 2-week target for v1.

---

## 0. One-paragraph summary

Etherlink is now a single chain with two interfaces: EVM (Ethereum JSON-RPC) and Michelson (Tezos RPC). A cross-interface call (NAC) starts in one runtime and executes atomically in the other, inside one transaction. Baking Bad's **0xTzKT** already indexes both legs of every crossing (mainnet, Shadownet, Previewnet) and BCD has a Tezos X instance, so **nactrace is not an explorer**. It is a **NAC debugger for developers**: give it a hash (either side) and it tells you _what happened and why it failed_: which leg reverted, the decoded `Cross-runtime call failed with status 4xx: …` reason, the Michelson error, storage before/after, per-frame gas in both units. Delivered as a library (`@nactrace/core`), a CLI (`nactrace <hash>`), a Foundry/Hardhat hook that runs on failed Previewnet tests, an embeddable widget, and a nightly CI that flags kernel/schema changes. Data comes from 0xTzKT first, EVM `debug_traceTransaction` and Tezos RPC for what the indexer does not expose.

---

## 1. Primary sources (read these first, in this order)

| #   | What                                                                                                                                                                                                                                                                                                                                                                                                                                      | URL                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | NAC concept: gateways, atomicity, re-entrancy, observability ("each cross-interface call emits an event from the gateway before execution, containing an identifier that can be used to correlate calls across the two runtimes")                                                                                                                                                                                                         | https://docs.etherlink.com/overview/native-atomic-composability                                              |
| 2   | Architecture: two runtimes, per-interface blocks derived from each Etherlink block, sequencer, `octez-evm-node` serves both interfaces                                                                                                                                                                                                                                                                                                    | https://docs.etherlink.com/overview/architecture                                                             |
| 3   | Accounts & aliases: how a tz1 gets an EVM alias (`keccak256(utf8(tz_address_base58))[0:20]`, EIP-7702 forwarder) and how an EVM account gets a KT1 alias                                                                                                                                                                                                                                                                                  | https://docs.etherlink.com/overview/accounts-and-aliases                                                     |
| 4   | NAC usage, EVM → Michelson: gateway precompile `0xff00000000000000000000000000000000000007`, `callMichelson(string destination, string entrypoint, bytes data)`, `callMichelsonView(...)`, failure model, error string `"Cross-runtime call failed with status 4xx: <reason>"`                                                                                                                                                            | https://docs.etherlink.com/evm/nac-usage                                                                     |
| 5   | NAC usage, Michelson → EVM: enshrined gateway `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`, `%call_evm` (pair string (pair string (pair bytes (option (contract bytes))))), `staticcall_evm` view, callback delivery via `TRANSFER_TOKENS`                                                                                                                                                                                                      | https://docs.etherlink.com/michelson/nac-usage                                                               |
| 6   | Cross-interface counter tutorial (the reference test fixture; live demo at https://tzx-counter.vercel.app/)                                                                                                                                                                                                                                                                                                                               | https://docs.etherlink.com/tutorials/nac-counter                                                             |
| 7   | EVM network info: Mainnet RPC `https://node.mainnet.etherlink.com`, chain id 42793, Blockscout `https://explorer.etherlink.com`; Shadownet RPC `https://node.shadownet.etherlink.com`, chain id 127823, explorer `https://shadownet.explorer.etherlink.com`; NAC precompile listed under "Precompiled contracts"                                                                                                                          | https://docs.etherlink.com/evm/get-started/network-information                                               |
| 8   | Michelson network info: Mainnet RPC `https://michelson.etherlink.mainnet.octez.io`, chain id `NetXohUVN5QWR4f`, TzKT `https://etherlink.tzkt.io` / API `https://api.etherlink.tzkt.io`; Shadownet RPC `https://michelson.etherlink.shadownet.octez.io`, TzKT API `https://api.shadownet.etherlink.tzkt.io`; self-hosted node serves Michelson at `<node>/tezlink`                                                                         | https://docs.etherlink.com/michelson/network-information                                                     |
| 9   | Michelson RPC reference: same RPCs as Tezos L1 (Octez reference), with a list of not-applicable / not-implemented / different RPCs. Note: `run_script_view`, `run_code`, `trace_code` NOT implemented; `pack_data` uses a dummy context                                                                                                                                                                                                   | https://docs.etherlink.com/michelson/developing/rpc-reference                                                |
| 10  | Ethereum endpoint support: `debug_traceTransaction` **Yes**, `debug_traceCall` partial (callTracer, structLogger only), `debug_traceBlockByNumber` yes, `eth_getLogs` yes, `eth_getBlockReceipts` yes, filters NOT supported, `eth_subscribe` experimental                                                                                                                                                                                | https://docs.etherlink.com/evm/developing/endpoint-support                                                   |
| 11  | Tezos X Previewnet dashboard: endpoints, faucet, per-version changelog (read every "Action required" block; they describe event renames, hash derivation, receipt shape)                                                                                                                                                                                                                                                                  | https://previewnet.tezosx.nomadic-labs.com/                                                                  |
| 12  | Previewnet canonical repo (chain ids, rollup address, kernel config)                                                                                                                                                                                                                                                                                                                                                                      | https://github.com/trilitech/tezos-x-previewnet                                                              |
| 13  | Previewnet page in docs                                                                                                                                                                                                                                                                                                                                                                                                                   | https://docs.etherlink.com/testing/previewnet                                                                |
| 14  | Full Tezos X technical changelog                                                                                                                                                                                                                                                                                                                                                                                                          | https://gitlab.com/tezos/tezos/-/blob/master/etherlink/CHANGES_TEZOSX.md                                     |
| 15  | Kernel Solidity examples (incl. `crac_michelson_view_staticcall.sol`) — use to find event/ABI definitions                                                                                                                                                                                                                                                                                                                                 | https://gitlab.com/tezos/tezos/-/tree/master/etherlink/kernel_latest/solidity_examples                       |
| 16  | Kernel sources (search here for event signatures `CrossRuntimeCallSent`, `CrossRuntimeCallReceived`, the gateway precompile, and the mirrored-hash derivation)                                                                                                                                                                                                                                                                            | https://gitlab.com/tezos/tezos/-/tree/master/etherlink                                                       |
| 17  | Octez RPC reference (for Michelson-side RPC shapes)                                                                                                                                                                                                                                                                                                                                                                                       | https://octez.tezos.com/docs/active/rpc.html                                                                 |
| 18  | Octez OpenAPI descriptions                                                                                                                                                                                                                                                                                                                                                                                                                | https://octez.tezos.com/docs/api/openapi.html                                                                |
| 19  | **0xTzKT API (PRIMARY DATA SOURCE)** — Tezos X indexer by Baking Bad. Swagger with all supported `direction` values and models. Mainnet `https://api.xtzkt.io/`, Shadownet `https://api.shadownet.xtzkt.io/`, Previewnet `https://api.previewnet.xtzkt.io/`. Example NAC queries: `/v1/operations/transaction?hash=<op or tx hash>` and `/v1/operations/transaction?gateway.hash=0xff00000000000000000000000000000000000007&sort=id.desc` | https://api.xtzkt.io/                                                                                        |
| 19b | BCD for Tezos X (contract/storage inspection, useful for manual verification)                                                                                                                                                                                                                                                                                                                                                             | https://tezosx.better-call.dev/                                                                              |
| 19c | Baking Bad announcement of 0xTzKT                                                                                                                                                                                                                                                                                                                                                                                                         | https://x.com/TezosBakingBad/status/2100175551457579481                                                      |
| 19d | `CrossRuntimeCallSent` event definition (EVM gateway precompile)                                                                                                                                                                                                                                                                                                                                                                          | https://gitlab.com/tezos/tezos/-/blob/master/etherlink/kernel_latest/revm/src/precompiles/runtime_gateway.rs |
| 19e | `CrossRuntimeCallReceived` event definition                                                                                                                                                                                                                                                                                                                                                                                               | https://gitlab.com/tezos/tezos/-/blob/master/etherlink/kernel_latest/tezosx-ethereum-runtime/src/lib.rs#L291 |
| 19f | Mirrored hash derivation, with golden-vector tests (see also v0.9 changelog, `MR !22718`)                                                                                                                                                                                                                                                                                                                                                 | https://gitlab.com/tezos/tezos/-/blob/master/etherlink/kernel_latest/tezosx-journal/src/tezosx_journal.rs    |
| 19g | Classic TzKT API reference (0xTzKT keeps the same conventions: filters like `field.eq`, `sort`, `select`, `limit`)                                                                                                                                                                                                                                                                                                                        | https://api.tzkt.io/                                                                                         |
| 20  | Blockscout REST API v2 docs                                                                                                                                                                                                                                                                                                                                                                                                               | https://docs.blockscout.com/devs/apis/rest                                                                   |
| 21  | Etherlink docs repo (open PRs often document features before the site does; e.g. PR #459 alias RPCs `tez_getTezosEthereumAddress` / `tez_getEthereumTezosAddress`, PR #461 atomicity Q&A)                                                                                                                                                                                                                                                 | https://github.com/etherlinkcom/docs                                                                         |
| 22  | Fee structure (for gas/fee display)                                                                                                                                                                                                                                                                                                                                                                                                       | https://docs.etherlink.com/evm/developing/fees                                                               |
| 23  | Etherlink Discord (dev support, Tezos X channel)                                                                                                                                                                                                                                                                                                                                                                                          | https://discord.gg/etherlink and https://discord.gg/tezos                                                    |
| 24  | Status page                                                                                                                                                                                                                                                                                                                                                                                                                               | https://status.etherlink.com                                                                                 |

---

## 2. Network matrix

| Network                                 | EVM RPC                                          | EVM chain id     | Blockscout                                              | Michelson RPC                                          | Michelson chain id | TzKT API                                                                                                                                                     | Faucet                                               |
| --------------------------------------- | ------------------------------------------------ | ---------------- | ------------------------------------------------------- | ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Tezos X Previewnet (primary dev target) | `https://evm.previewnet.tezosx.nomadic-labs.com` | 128064 (0x1f440) | `https://blockscout.previewnet.tezosx.nomadic-labs.com` | `https://michelson.previewnet.tezosx.nomadic-labs.com` | see dashboard      | `https://tzkt.previewnet.tezosx.nomadic-labs.com` (API base: verify on dashboard, likely `https://api.tzkt.previewnet.tezosx.nomadic-labs.com` — **verify**) | `https://faucet.previewnet.tezosx.nomadic-labs.com/` |
| Etherlink Mainnet                       | `https://node.mainnet.etherlink.com`             | 42793            | `https://explorer.etherlink.com`                        | `https://michelson.etherlink.mainnet.octez.io`         | `NetXohUVN5QWR4f`  | `https://api.etherlink.tzkt.io`                                                                                                                              | —                                                    |
| Etherlink Shadownet                     | `https://node.shadownet.etherlink.com`           | 127823           | `https://shadownet.explorer.etherlink.com`              | `https://michelson.etherlink.shadownet.octez.io`       | `NetXtLrzvQDobza`  | `https://api.shadownet.etherlink.tzkt.io`                                                                                                                    | `https://shadownet.faucet.etherlink.com/`            |

0xTzKT endpoints (add to every network config; these replace the "verify TzKT base" note from v0.1):

- Previewnet: `https://api.previewnet.xtzkt.io`
- Mainnet: `https://api.xtzkt.io`
- Shadownet: `https://api.shadownet.xtzkt.io`
  Schema status (Baking Bad, 25 Sep 2026): meant for all Tezos devs to depend on; still actively developed, changes expected to be additive, stabilizing in 1–2 months. → adapter must ignore unknown fields, never fail on extra fields, and pin `xtzktSchemaObservedAt` in fixtures so the nightly CI can diff.

Constants (same on all networks):

- EVM→Michelson gateway precompile: `0xff00000000000000000000000000000000000007`
- Michelson→EVM gateway contract: `KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw`
- Internal attribution address for cross-interface calls seen on Blockscout: `0x7e205800…01` (full value: read from a real receipt)
- Previewnet is reset from time to time (last full reset 20 Jul 2026; contract loss incident 6–7 May 2026). Never hardcode addresses of test contracts; keep them in a `fixtures/<network>.json` that is easy to regenerate.
- Public RPC rate limit: 1000 req/min on Etherlink public endpoints. Cache aggressively; never poll.

---

## 3. Verified facts about the on-chain footprint of a NAC call

### 3.1 Mirrored hashes (from Nomadic, Discord 25 Sep 2026; code in source 19f)

Whichever side actually ran keeps its real hash; the counterpart is derived. Byte-string tags are prepended to the 32-byte parent hash. The two are one-way and not inverses.

```
# EVM-originated crossing: real EVM tx hash → synthetic Michelson op hash
michelson_op_hash = BLAKE2b-256( "michelson" ++ evm_tx_hash_bytes )

# Michelson-originated crossing: real op hash → synthetic EVM tx hash
evm_tx_hash = keccak256( "evm" ++ michelson_op_hash_bytes )
```

Implement both in `core/src/hashes.ts` and unit-test them against the golden vectors in `tezosx_journal.rs`. The Michelson op hash must be base58-encoded with the Tezos op prefix (`o…`) for display and for querying Tezos RPC; keep the raw 32 bytes internally. Use `@noble/hashes` (blake2b, keccak_256) to stay browser-safe.

### 3.2 What 0xTzKT returns for a crossing (observed on mainnet, 25 Sep 2026)

`GET /v1/operations/transaction?hash=<hash>` returns one row **per leg**, sharing the same `hash`, distinguished by `direction`:

- `x_michelson` — the Michelson leg (tz1 → KT1 alias or contract)
- `x_michelson_evm` — Michelson-originated crossing into EVM (sender is the `x_michelson_alias`, `initiator` is the tz1, `target` is the 0x)
- `x_evm_michelson` — EVM-originated crossing into Michelson (sender/initiator 0x, `target` tz1/KT1)
- plain EVM rows also exist (check Swagger for the full `direction` enum before coding)

Useful fields seen: `chain.layer:"x"`, `level`, `timestamp`, `sender`/`initiator`/`target` with `type` in {`x_evm_user`, `x_evm_alias`, `x_evm_contract`, `x_michelson_user`, `x_michelson_alias`, `x_michelson_contract`}, `alias` (the counterpart account), `gateway` (0xff…07 or KT18oDJ…), `gatewayEntrypoint` (`callMichelson(string,string,bytes)`, `call(string,(string,string)[],bytes,uint8)`, or Michelson `call`), decoded `gatewayParameters` (`destination`, `entrypoint`, `parameters`; or `url` like `http://tezos/tz1…` / `http://ethereum/0x…`, `method`, `headers`, `body`), raw `gatewayInput` / `gatewayParametersRaw`, `status` (`applied`, …), `gasUsed`, `gasLimit`, `opType` (`dynamic_fee` = top-level EVM tx, `trace` = internal call), `opCode`, `amountSent` (wei string) / `amountReceived` (mutez) / `roundingLoss`, fee fields (`daFee`, `gasFee`, `gasPrice`, `effectiveGasPrice`).
Save real responses under `fixtures/raw/xtzkt/` on Day 1 and generate the TS types from them (do not hand-write a schema from memory).

### 3.3 Events (sources 19d, 19e)

- `CrossRuntimeCallSent` is emitted by the EVM gateway precompile before the callee runs (source: `runtime_gateway.rs`).
- `CrossRuntimeCallReceived` is emitted on the receiving side (`tezosx-ethereum-runtime/src/lib.rs`, around line 291).
- Read the exact Solidity-style signatures and indexed fields from those two files, compute topic0 with viem `toEventSelector`, and confirm against a real receipt from `eth_getTransactionReceipt`. Record both in `docs/FINDINGS.md`.

### 3.4 Failure semantics (docs, sources 1, 4, 5, 11)

- EVM side: revert with reason `"Cross-runtime call failed with status 4xx: <reason>"`. Contracts using low-level `call` may swallow it → `partially_caught`.
- Michelson side: no try/catch; any EVM failure reverts the whole operation group. Aliases originated inside a failing call show `backtracked` (v0.9).
- Failed calls always produce a receipt, even under gas pressure (v0.6). `debug_traceTransaction` with `callTracer` crosses the boundary (v0.8); per-frame `gasUsed` correct from v0.10.

### 3.5 Aliases (source 3, PR #459)

- tz→EVM alias: `keccak256(utf8(base58 tz address))[0:20]`. Computable offline; 0xTzKT also labels it as `x_evm_alias`.
- EVM→Michelson alias: a KT1 created on first crossing; 0xTzKT returns it in `alias`. Do not recompute; if needed use node RPCs `tez_getTezosEthereumAddress` / `tez_getEthereumTezosAddress` on the EVM JSON-RPC base URL.
- Gateway precompile `originOf` / `resolveAddress` remain available via `eth_call` for labelling addresses that 0xTzKT has not seen.

---

## 4. Product scope

### In scope (v1, grant deliverable, USD 9K)

- Input: an EVM tx hash, a Tezos op hash, or a Blockscout/TzKT/0xTzKT URL containing one. Network auto-detected across Previewnet / Mainnet / Shadownet via 0xTzKT.
- Output: normalized `Trace` JSON (§6) and an **explanation**: root cause of failure in one sentence, which leg failed, decoded reasons on both sides, storage before/after for touched Michelson contracts, gas per frame in EVM gas and Michelson milligas.
- CLI `nactrace <hash>` with tree output, `--json`, `--explain-only`, exit code 1 on revert.
- **Test-framework hook**: `nactrace-foundry` (a small script invoked from `forge test --json` output or a Foundry `ffi` helper) and a Hardhat plugin task `nactrace:last` that, on a failed Previewnet test, prints the explanation for the offending tx.
- Embeddable widget (`nactrace.js`, `data-hash`, `data-network`), compact timeline + explanation. Uses 0xTzKT with CORS.
- Nightly CI that re-runs fixtures against live Previewnet, diffs `Trace` snapshots and the observed 0xTzKT field set, and opens a GitHub issue on change.
- Both directions, nested crossings, views, atomic reverts, partial catches.

### Out of scope (say so in README)

- **Web explorer UI** (0xTzKT / BCD territory; link to them instead).
- Indexing, databases, history, address pages, dashboards.
- Michelson interpretation beyond RPC storage reads.
- Wallet / signing.

---

## 5. Architecture

Monorepo (pnpm workspaces):

```
nactrace/
  packages/
    core/        @nactrace/core   — pure TS, no DOM, no Node-only APIs (works in browser and Node)
    cli/         nactrace         — Node CLI wrapping core, pretty tree output, --json
    hooks/       nactrace-hardhat (plugin task) and nactrace-foundry (post-test script)
    widget/      tiny IIFE bundle: <script src=".../nactrace.js" data-hash="0x…" data-network="previewnet">
  fixtures/      <network>.json: known tx hashes with expected Trace snapshots
  .github/workflows/
    ci.yml       unit tests on PR
    nightly.yml  runs fixtures against live Previewnet, opens an issue on diff
```

Core design rules:

- `core` depends only on `fetch`. Use `viem` for EVM (ABI decode, RPC client), `@noble/hashes` for the mirrored-hash recipe, plain `fetch` for 0xTzKT and Tezos RPC. Keep the bundle small for the widget.
- Every network call goes through one `Provider` interface with an in-memory cache keyed by (network, method, params). Add a `--record`/`--replay` mode that dumps/reads raw RPC responses to `fixtures/raw/` so unit tests never hit the network.
- Never throw away raw data: `Trace` keeps `raw` blobs for every source so the UI can show "why did we conclude this".

### 5.1 Data flow (either hash)

```
input hash or URL
  → 0xTzKT GET /v1/operations/transaction?hash=… on each network until one answers
       → rows for every leg: direction, sender/initiator/target/alias types, gateway params, status, gas, amounts
  → build the skeleton Trace from those rows (this alone already gives the full crossing tree)
  → enrich EVM legs: eth_getTransactionReceipt (logs, topic0 of gateway events) + debug_traceTransaction(callTracer) (frames, revert data)
  → enrich Michelson legs: Tezos RPC block operations at `level` (errors, internal ops) + storage of touched KT1s at level and level-1 (diff)
  → compute counterpart hashes with the §3.1 recipe and assert they match what 0xTzKT returned (mismatch → warning in trace.meta, never a crash)
  → explain(): pick the deepest failed node, decode its reason, summarize in one sentence
```

### 5.2 Fallback when 0xTzKT is down or lags

Compute the counterpart hash locally (§3.1), query EVM RPC and Tezos RPC directly, mark `trace.meta.source = "rpc_only"`. Same Trace shape, fewer labels.

### 5.3 Correlation strategy

1. 0xTzKT rows sharing the same `hash` (primary).
2. Derived hash (§3.1) for RPC-only mode and for cross-checking.
3. No block/alias search anymore (dropped from v0.1).

---

## 6. `Trace` JSON schema (v1)

```ts
type Runtime = "evm" | "michelson";

interface Trace {
  schemaVersion: "1";
  network: "previewnet" | "mainnet" | "shadownet";
  root: Node; // the user-submitted tx/op
  status: "success" | "reverted" | "partially_caught";
  atomic: boolean; // true if any failure fully rolled back both sides
  explanation: {
    summary: string; // one sentence: "EVM call to KT1… reverted: Michelson entrypoint %transfer failed with FA2_INSUFFICIENT_BALANCE; whole tx rolled back"
    failedNodeId?: string;
    evmReason?: string; // decoded "Cross-runtime call failed with status 4xx: …"
    michelsonError?: unknown; // raw error from Tezos RPC receipt
  };
  meta: {
    source: "xtzkt+rpc" | "rpc_only";
    xtzktSchemaObservedAt?: string;
    kernelVersionHint?: string;
    correlation: "xtzkt_hash" | "derived_hash";
    fetchedAt: string;
    sources: { url: string; method: string }[];
  };
}

interface Node {
  id: string; // stable within trace
  runtime: Runtime;
  kind: "tx" | "op" | "call" | "view" | "crossing" | "callback" | "alias_created";
  hash?: string; // tx hash or op hash for tx/op nodes; synthetic hashes flagged
  synthetic?: boolean;
  from: Address;
  to: Address;
  entrypoint?: string; // Michelson entrypoint or EVM selector/function name
  value?: string; // wei or mutez as string, with unit
  gas?: { used?: string; limit?: string; unit: "evm_gas" | "michelson_milligas" };
  status: "success" | "reverted" | "backtracked" | "skipped";
  error?: string; // decoded revert reason, e.g. "Cross-runtime call failed with status 4xx: …"
  storageDiff?: { before: unknown; after: unknown }; // Michelson contracts only, best effort
  events: DecodedEvent[];
  children: Node[];
  links: { blockscout?: string; tzkt?: string };
  raw?: Record<string, unknown>;
}

interface Address {
  value: string; // 0x… or tz1…/KT1…
  runtime: Runtime;
  role: "native" | "alias" | "gateway" | "system" | "unknown";
  counterpart?: string; // alias in the other runtime, if resolvable
  label?: string; // "NAC gateway (EVM side)", "AliasForwarder for tz1…", etc.
}
```

Keep the schema versioned. The nightly CI compares `Trace` snapshots for fixture hashes ignoring `meta.fetchedAt`.

---

## 7. Implementation plan (2 weeks, solo, Claude Code)

### Week 1 — core, CLI, hooks

**Day 1: ground truth (half a day now, not two days).**

- [ ] Fund a 0x and a tz1 on Previewnet from the faucet; run the counter tutorial to produce: one success, one atomic revert, one view.
- [ ] Pull those hashes plus 5 mainnet crossings (query `gateway.hash=0xff…07` and `gateway.hash=KT18oDJ…`) from 0xTzKT; save raw JSON under `fixtures/raw/xtzkt/`.
- [ ] Save `eth_getTransactionReceipt` + `debug_traceTransaction` + Tezos RPC block ops for the same hashes under `fixtures/raw/rpc/`.
- [ ] Read `runtime_gateway.rs` and `lib.rs#L291`; write the event ABIs into `core/src/events.ts`; confirm topic0 against a real receipt.
- [ ] Implement and test the hash recipe against the golden vectors in `tezosx_journal.rs`.
- [ ] Start `docs/FINDINGS.md`.

**Day 2–5: `@nactrace/core` + CLI.**

- [ ] `Provider` with cache + record/replay; 0xTzKT adapter (types generated from fixtures, tolerant to extra fields); EVM adapter (viem); Tezos RPC adapter.
- [ ] `buildTrace()` per §5.1, `explain()`, RPC-only fallback.
- [ ] CLI with tree output and `--explain-only`. Publish `0.1.0`.
- [ ] `hooks/`: Hardhat task `nactrace:last` (reads the last failed tx hash from the test run or from a `--hash` flag) and a Foundry post-test script reading `forge test --json`. Keep both thin: they only call the CLI.

Acceptance: every fixture yields a correct `Trace` and a one-sentence explanation that a dev would agree with; the tutorial revert prints the Michelson error and "whole tx rolled back".

### Week 2 — widget, CI, release

- [ ] `packages/widget`: IIFE < 60 KB gz, renders compact timeline + explanation, no React, uses 0xTzKT directly (CORS confirmed by Baking Bad).
- [ ] `nightly.yml`: re-run fixtures on live Previewnet; diff `Trace` snapshots; diff the set of 0xTzKT field names seen; open/update an issue on change; log `web3_clientVersion`.
- [ ] Docs: README with GIF, `FINDINGS.md`, `SCHEMA.md`, hook setup guides.
- [ ] 2-minute recording; post in Discord Tezos X channel and Agora; tag `v1.0.0`.

---

## 8. Testing strategy

- Unit: recorded RPC fixtures, deterministic. Target 80% on `core`.
- Contract tests: `fixtures/<network>.json` with expected `Trace` snapshots (minus volatile fields).
- Live smoke: nightly only. Never in PR CI (rate limits, flakiness).
- Regenerate fixtures with `pnpm fixtures:record --network previewnet` after a Previewnet reset. Document the procedure.

---

## 9. Known risks & mitigations

| Risk                                                                 | Mitigation                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0xTzKT schema changes (additive expected, stabilizing in 1–2 months) | Tolerant types; nightly field-set diff; pin observed schema date in fixtures            |
| 0xTzKT down or lagging                                               | RPC-only fallback with locally derived hashes                                           |
| Previewnet resets wipe fixtures                                      | Mainnet fixtures are permanent; Previewnet fixtures regenerable via `scripts/`          |
| Baking Bad or Nomadic ship a debugger                                | Q3 asked on Discord 25 Sep; if yes, pivot to Compat Check (reuse nightly CI + adapters) |
| Event ABI drift between kernel versions                              | ABIs live in one file with kernel version comment; nightly CI catches topic0 mismatch   |

---

## 10. Open questions (status 25 Sep 2026)

1. ~~Cross-interface explorer coming back?~~ Irrelevant: 0xTzKT + BCD cover it; nactrace is not an explorer.
2. ~~Where are the events defined?~~ Answered: sources 19d, 19e.
3. ~~Hash derivation?~~ Answered: §3.1, source 19f. No dedicated RPC.
4. ~~0xTzKT stable / CORS?~~ Answered: yes, additive changes possible for 1–2 months.
5. **Open**: is a NAC debugging tool already on Baking Bad's or Nomadic's roadmap? Asked 25 Sep. Answer decides grant submission, not Day 1 work.
6. Minor: full `direction` enum and whether `debug_traceTransaction` is enabled on the public Previewnet/mainnet endpoints (test on Day 1).

---

## 11. Notes for Claude Code (working agreement)

- Before writing code for any RPC shape, **fetch a real response** from Previewnet and save it under `fixtures/raw/`. Do not invent field names.
- When a doc page and observed behaviour disagree, trust the RPC and log the discrepancy in `FINDINGS.md`.
- Keep `core` framework-free; the widget must not pull React.
- Every PR: tests pass offline; `pnpm lint`; no network in unit tests.
- Commit messages: conventional commits. Tag fixture regenerations explicitly (`chore(fixtures): re-record after previewnet reset`).
- Do not add features outside §4. If tempted, write it in `docs/ROADMAP.md` instead.
- Never re-implement what 0xTzKT already returns. If a field exists there, read it from there; RPC is for enrichment and fallback only.
- The product is the explanation, not the tree. When choosing where to spend effort, prefer better `explain()` output over prettier rendering.

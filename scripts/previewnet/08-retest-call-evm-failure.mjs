#!/usr/bin/env node
// Re-test of the FINDINGS claim "a Michelson-originated crossing whose EVM leg reverts never
// reaches a block" (etherlinkcom/docs#466 review). Sends the same failing %call_evm (boom() on the
// kitchen sink) three ways, plus a succeeding control, and reports inclusion + status for each:
//   - raw forge/sign/inject with the October parameters (gas 120000, fee 20000)
//   - raw with a much larger gas limit, to rule out a gas-limit artefact
//   - Taquito transfer with explicit limits (no estimation), the "normal user" path
//   - control: raw ping() (succeeds)
// Does not write fixtures/previewnet.state.json; prints a JSON summary at the end.
// Run: node --env-file=.env scripts/previewnet/08-retest-call-evm-failure.mjs
import { readFileSync } from "node:fs";
import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { LocalForger } from "@taquito/local-forging";

const RPC = "https://michelson.previewnet.tezosx.nomadic-labs.com";
const EVM_RPC = "https://evm.previewnet.tezosx.nomadic-labs.com";
const GATEWAY = "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw";
const state = JSON.parse(
  readFileSync(new URL("../../fixtures/previewnet.state.json", import.meta.url), "utf8"),
);
const sink = state.kitchenSink?.address;
if (!sink) throw new Error("run 04 first");

const tezos = new TezosToolkit(RPC);
const signer = new InMemorySigner(process.env.TEZOS_SECRET_KEY);
tezos.setProvider({ signer });
const pkh = await signer.publicKeyHash();
const forger = new LocalForger();

const callEvm = (dest, signature) => ({
  prim: "Pair",
  args: [
    { string: dest },
    {
      prim: "Pair",
      args: [{ string: signature }, { prim: "Pair", args: [{ bytes: "" }, { prim: "None" }] }],
    },
  ],
});

const evm = async (method, params = []) =>
  (
    await (
      await fetch(EVM_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
    ).json()
  ).result;

const results = {
  network: "previewnet",
  at: new Date().toISOString(),
  evmNode: await evm("web3_clientVersion"),
  kernelVersion: await evm("tez_kernelVersion", ["latest"]),
  cases: {},
};

async function waitFor(key, hash, fromLevel) {
  for (let level = fromLevel, tries = 0; tries < 40; tries++) {
    const ops = await tezos.rpc
      .getBlock({ block: String(level) })
      .then((b) => b.operations)
      .catch(() => null);
    if (!ops) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const found = ops.flat().find((o) => o.hash === hash);
    if (found) {
      const c = found.contents.find((x) => x.kind === "transaction");
      const r = c?.metadata?.operation_result;
      const internals = (c?.metadata?.internal_operation_results ?? []).map((i) => ({
        kind: i.kind,
        status: i.result?.status,
        errors: i.result?.errors,
      }));
      results.cases[key] = {
        hash,
        included: true,
        level,
        status: r?.status,
        errors: r?.errors,
        internals,
      };
      console.log(`${key}: included at ${level} status=${r?.status}`);
      return;
    }
    level++;
  }
  const pending = await tezos.rpc
    .getPendingOperations({ version: "2" })
    .then((p) =>
      Object.entries(p)
        .filter(([, v]) => Array.isArray(v) && v.some((o) => o.hash === hash))
        .map(([k]) => k),
    )
    .catch(() => "mempool RPC unavailable");
  results.cases[key] = { hash, included: false, mempoolClasses: pending };
  console.log(`${key}: NOT included after 40 blocks (mempool: ${JSON.stringify(pending)})`);
}

async function raw(key, signature, { gasLimit = "120000", fee = "20000" } = {}) {
  const branch = await tezos.rpc.getBlockHash();
  const header = await tezos.rpc.getBlockHeader();
  const counterNow = Number((await tezos.rpc.getContract(pkh)).counter);
  const contents = [
    {
      kind: "transaction",
      source: pkh,
      fee,
      counter: String(counterNow + 1),
      gas_limit: gasLimit,
      storage_limit: "1000",
      amount: "0",
      destination: GATEWAY,
      parameters: { entrypoint: "call_evm", value: callEvm(sink, signature) },
    },
  ];
  const forged = await forger.forge({ branch, contents });
  const { sbytes, prefixSig } = await signer.sign(forged, new Uint8Array([3]));
  const pre = await tezos.rpc
    .preapplyOperations([{ branch, contents, protocol: header.protocol, signature: prefixSig }])
    .then((p) => p[0]?.contents?.[0]?.metadata?.operation_result?.status ?? "?")
    .catch((e) => `preapply error: ${String(e.body ?? e.message).slice(0, 400)}`);
  console.log(`${key}: preapply -> ${pre}`);
  let hash;
  try {
    hash = await tezos.rpc.injectOperation(sbytes);
  } catch (e) {
    results.cases[key] = { injected: false, preapply: pre, error: String(e.message).slice(0, 400) };
    console.log(`${key}: injection refused`);
    return;
  }
  console.log(`${key}: injected ${hash} forged=${forged.slice(0, 24)}…`);
  await waitFor(key, hash, header.level + 1);
  Object.assign(results.cases[key], { preapply: pre, gasLimit, fee, forged: sbytes });
}

async function taquitoNoEstimate(key, signature) {
  const head = (await tezos.rpc.getBlockHeader()).level;
  try {
    const op = await tezos.contract.transfer({
      to: GATEWAY,
      amount: 0,
      fee: 20000,
      gasLimit: 120000,
      storageLimit: 1000,
      parameter: { entrypoint: "call_evm", value: callEvm(sink, signature) },
    });
    console.log(`${key}: injected ${op.hash}`);
    await waitFor(key, op.hash, head + 1);
  } catch (e) {
    results.cases[key] = { injected: false, error: String(e.message).slice(0, 400) };
    console.log(`${key}: refused by Taquito/node: ${String(e.message).slice(0, 200)}`);
  }
}

// control ping() already confirmed applied on 2026-11-20: opMSwxqGfHcMHPQ6iFy8v3sJ2sLSHmNF4CzWREwTDVM77mH2ZHp
await raw("boom_raw_oct_params", "boom()");
await raw("boom_raw_gas_1M", "boom()", { gasLimit: "1000000", fee: "120000" });
await taquitoNoEstimate("boom_taquito_explicit_limits", "boom()");

console.log(JSON.stringify(results, null, 2));

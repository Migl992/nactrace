#!/usr/bin/env node
// Michelson-originated cases on Previewnet, from the tz1 in .env:
//   - a plain Michelson call (no crossing), used to bring the counter to 0
//   - %call_evm successes: ping(), ping() with a callback contract, a value transfer to a 0x
//   - %call_evm failures: EVM revert with reason, custom error, missing function, revert after a
//     nested crossing, nested Michelson failure
// Failing operations are forged and injected directly (Taquito's simulation would refuse them).
// Run: node --env-file=.env scripts/previewnet/05-michelson-cases.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { LocalForger } from "@taquito/local-forging";

const RPC = "https://michelson.previewnet.tezosx.nomadic-labs.com";
const GATEWAY = "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw";
const statePath = new URL("../../fixtures/previewnet.state.json", import.meta.url);
const state = JSON.parse(readFileSync(statePath, "utf8"));
const counter = state.michelsonCounter?.address;
const sink = state.kitchenSink?.address;
if (!counter || !sink) throw new Error("run 01 and 04 first");
state.txs = state.txs ?? {};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

const tezos = new TezosToolkit(RPC);
const signer = new InMemorySigner(process.env.TEZOS_SECRET_KEY);
tezos.setProvider({ signer });
const pkh = await signer.publicKeyHash();
const forger = new LocalForger();

const callEvm = (dest, signature, argsHex = "", callback = null) => ({
  prim: "Pair",
  args: [
    { string: dest },
    {
      prim: "Pair",
      args: [
        { string: signature },
        {
          prim: "Pair",
          args: [
            { bytes: argsHex },
            callback ? { prim: "Some", args: [{ string: callback }] } : { prim: "None" },
          ],
        },
      ],
    },
  ],
});

/** Normal path: Taquito estimates and simulates (only for ops expected to succeed). */
async function sendOk(key, params) {
  if (state.txs[key]?.opHash) return console.log(`${key}: already sent ${state.txs[key].opHash}`);
  const op = await tezos.contract.transfer({ fee: 8000, ...params });
  await op.confirmation(1);
  console.log(`${key}: ${op.hash} level=${op.includedInBlock} status=${op.status}`);
  state.txs[key] = { opHash: op.hash, level: op.includedInBlock, status: op.status };
  save();
}

/** Raw path: forge + sign + inject, then wait for inclusion. Used for ops expected to fail. */
async function sendRaw(
  key,
  { to, entrypoint, value, amount = "0", gasLimit = "120000", fee = "20000" },
) {
  if (state.txs[key]?.opHash) return console.log(`${key}: already sent ${state.txs[key].opHash}`);
  const branch = await tezos.rpc.getBlockHash();
  const head = (await tezos.rpc.getBlockHeader()).level;
  const counterNow = Number((await tezos.rpc.getContract(pkh)).counter);
  const contents = [
    {
      kind: "transaction",
      source: pkh,
      fee,
      counter: String(counterNow + 1),
      gas_limit: gasLimit,
      storage_limit: "1000",
      amount,
      destination: to,
      parameters: { entrypoint, value },
    },
  ];
  const forged = await forger.forge({ branch, contents });
  const { prefixSig, sbytes } = await signer.sign(forged, new Uint8Array([3]));
  let hash;
  try {
    hash = await tezos.rpc.injectOperation(sbytes);
  } catch (e) {
    console.log(`${key}: injection refused: ${e.message?.slice(0, 300)}`);
    return;
  }
  console.log(`${key}: injected ${hash} (sig ${prefixSig.slice(0, 8)}…), waiting…`);
  for (let level = head + 1, tries = 0; tries < 40; tries++) {
    let ops;
    try {
      ops = await tezos.rpc.getOperationsFromBlock(String(level)).catch(() => null);
    } catch {
      ops = null;
    }
    if (!ops) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const found = ops.flat().find((o) => o.hash === hash);
    if (found) {
      const status = found.contents[0]?.metadata?.operation_result?.status;
      console.log(`${key}: included at ${level} status=${status}`);
      state.txs[key] = { opHash: hash, level, status };
      save();
      return;
    }
    level++;
  }
  console.log(`${key}: not seen in 40 blocks`);
}

const storage = async () => (await tezos.rpc.getStorage(counter)).int;
console.log("tz1", pkh, "counter storage:", await storage());

// 1. plain Michelson call, no crossing: bring the counter to 0 (needed by 04's caught case)
if ((await storage()) !== "0") {
  await sendOk("plain_michelson_decrement", {
    to: counter,
    amount: 0,
    parameter: { entrypoint: "decrement", value: { prim: "Unit" } },
  });
}
// 2. successes through %call_evm
await sendOk("m_ping", {
  to: GATEWAY,
  amount: 0,
  parameter: { entrypoint: "call_evm", value: callEvm(sink, "ping()") },
});
if (!state.callbackReceiver?.address) {
  const code = readFileSync(
    new URL("../../contracts/michelson/receiver.tz", import.meta.url),
    "utf8",
  );
  const op = await tezos.contract.originate({ code, init: { bytes: "" }, fee: 4000 });
  await op.confirmation(1);
  state.callbackReceiver = {
    address: op.contractAddress,
    originationOpHash: op.hash,
    level: op.includedInBlock,
  };
  save();
  console.log("callback receiver at", op.contractAddress);
}
await sendOk("m_ping_with_callback", {
  to: GATEWAY,
  amount: 0,
  parameter: {
    entrypoint: "call_evm",
    value: callEvm(sink, "ping()", "", state.callbackReceiver.address),
  },
});
await sendOk("m_transfer_to_evm_user", {
  to: GATEWAY,
  amount: 0.001,
  parameter: { entrypoint: "call_evm", value: callEvm(process.env.EVM_ADDRESS, "") },
});
// 3. failures through %call_evm (raw injection)
await sendRaw("m_boom", { to: GATEWAY, entrypoint: "call_evm", value: callEvm(sink, "boom()") });
await sendRaw("m_boom_custom", {
  to: GATEWAY,
  entrypoint: "call_evm",
  value: callEvm(sink, "boomCustom()"),
});
await sendRaw("m_missing_function", {
  to: GATEWAY,
  entrypoint: "call_evm",
  value: callEvm(sink, "nope()"),
});
await sendRaw("m_increment_then_boom", {
  to: GATEWAY,
  entrypoint: "call_evm",
  value: callEvm(sink, "incrementThenBoom()"),
});
await sendRaw("m_nested_michelson_failure", {
  to: GATEWAY,
  entrypoint: "call_evm",
  value: callEvm(sink, "callMissingEntrypoint()"),
});
await sendRaw("m_plain_michelson_failure", {
  to: counter,
  entrypoint: "decrement",
  value: { prim: "Unit" },
});
console.log("counter storage now:", await storage());

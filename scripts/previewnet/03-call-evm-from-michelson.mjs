#!/usr/bin/env node
// Michelson-originated crossing: the tz1 from .env calls the enshrined gateway
// KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw %call_evm targeting EvmToMichelsonCounter.increment(),
// which itself crosses back into Michelson (nested Michelson -> EVM -> Michelson).
// Parameter type (docs.etherlink.com/michelson/nac-usage):
//   pair string (pair string (pair bytes (option (contract bytes))))
//   = (destination 0x…, method signature, ABI params without selector, optional callback)
// Run: node --env-file=.env scripts/previewnet/03-call-evm-from-michelson.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";

const RPC = "https://michelson.previewnet.tezosx.nomadic-labs.com";
const GATEWAY = "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw";
const statePath = new URL("../../fixtures/previewnet.state.json", import.meta.url);
const state = JSON.parse(readFileSync(statePath, "utf8"));
const target = state.evmCounter?.address;
if (!target) throw new Error("run 02-deploy-and-call-evm.mjs first");

const tezos = new TezosToolkit(RPC);
tezos.setProvider({ signer: new InMemorySigner(process.env.TEZOS_SECRET_KEY) });

const value = {
  prim: "Pair",
  args: [
    { string: target },
    {
      prim: "Pair",
      args: [{ string: "increment()" }, { prim: "Pair", args: [{ bytes: "" }, { prim: "None" }] }],
    },
  ],
};

console.log(
  "calling",
  GATEWAY,
  "%call_evm ->",
  target,
  "increment() from",
  await tezos.signer.publicKeyHash(),
);
const op = await tezos.contract.transfer({
  to: GATEWAY,
  amount: 0,
  parameter: { entrypoint: "call_evm", value },
  fee: 6000,
});
console.log("op hash:", op.hash, "waiting for confirmation…");
await op.confirmation(1);
console.log("included at level", op.includedInBlock, "status", op.status);

state.txs = state.txs ?? {};
state.txs.michelson_to_evm_increment = {
  opHash: op.hash,
  level: op.includedInBlock,
  status: op.status,
};
writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log("saved to fixtures/previewnet.state.json");

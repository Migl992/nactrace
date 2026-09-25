#!/usr/bin/env node
// Originates contracts/michelson/counter.tz on Previewnet with the tz1 from .env.
// Prints the KT1 and the origination op hash. Run with: node --env-file=.env scripts/previewnet/01-originate-counter.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";

const RPC = "https://michelson.previewnet.tezosx.nomadic-labs.com";
const tezos = new TezosToolkit(RPC);
tezos.setProvider({ signer: new InMemorySigner(process.env.TEZOS_SECRET_KEY) });

const code = readFileSync(new URL("../../contracts/michelson/counter.tz", import.meta.url), "utf8");
console.log("originating from", await tezos.signer.publicKeyHash());
// Tezos X rejects Taquito's default fee estimate (evm_node.dev.insufficient_fees), so pin a higher fee in mutez.
const op = await tezos.contract.originate({ code, init: "0", fee: 4000 });
console.log("op hash:", op.hash, "waiting for confirmation…");
await op.confirmation(1);
const kt1 = op.contractAddress;
console.log("KT1:", kt1, "included at level", op.includedInBlock);

const statePath = new URL("../../fixtures/previewnet.state.json", import.meta.url);
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
state.michelsonCounter = { address: kt1, originationOpHash: op.hash, level: op.includedInBlock };
writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log("saved to fixtures/previewnet.state.json");

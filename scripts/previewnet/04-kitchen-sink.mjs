#!/usr/bin/env node
// Deploys contracts/solidity/KitchenSink.sol on Previewnet and sends every EVM-originated edge
// case. Hashes are appended to fixtures/previewnet.state.json under txs.*.
// Run: node --env-file=.env scripts/previewnet/04-kitchen-sink.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import solc from "solc";
import { createPublicClient, createWalletClient, defineChain, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { blake2b } from "@noble/hashes/blake2b.js";
import { sha256 } from "@noble/hashes/sha256.js";

const statePath = new URL("../../fixtures/previewnet.state.json", import.meta.url);
const state = JSON.parse(readFileSync(statePath, "utf8"));
const kt1 = state.michelsonCounter?.address;
if (!kt1) throw new Error("run 01-originate-counter.mjs first");

const previewnet = defineChain({
  id: 128064,
  name: "Tezos X Previewnet",
  nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm.previewnet.tezosx.nomadic-labs.com"] } },
});
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const pub = createPublicClient({ chain: previewnet, transport: http() });
const wallet = createWalletClient({ account, chain: previewnet, transport: http() });

// A syntactically valid KT1 that was never originated.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out;
}
function randomKt1() {
  const payload = new Uint8Array([2, 90, 121, ...blake2b(randomBytes(32), { dkLen: 20 })]);
  const check = sha256(sha256(payload)).slice(0, 4);
  return base58(new Uint8Array([...payload, ...check]));
}

const source = readFileSync(
  new URL("../../contracts/solidity/KitchenSink.sol", import.meta.url),
  "utf8",
);
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "KitchenSink.sol": { content: source } },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
);
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
const C = out.contracts["KitchenSink.sol"]["NacKitchenSink"];
const abi = C.abi;

let sink = state.kitchenSink;
if (!sink?.address) {
  const hash = await wallet.deployContract({
    abi,
    bytecode: `0x${C.evm.bytecode.object}`,
    args: [kt1],
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  sink = { address: rcpt.contractAddress, deployTx: hash, block: Number(rcpt.blockNumber) };
  state.kitchenSink = sink;
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  console.log(`NacKitchenSink deployed at ${sink.address} (tx ${hash})`);
} else {
  console.log(`NacKitchenSink already at ${sink.address}`);
}

async function send(key, functionName, args = [], value = 0n, gas = 5_000_000n) {
  if (state.txs?.[key]?.hash) {
    console.log(`${key}: already sent ${state.txs[key].hash}`);
    return;
  }
  const hash = await wallet.writeContract({
    address: sink.address,
    abi,
    functionName,
    args,
    value,
    gas,
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  console.log(
    `${key}: ${hash} status=${rcpt.status} block=${rcpt.blockNumber} gasUsed=${rcpt.gasUsed} logs=${rcpt.logs.length}`,
  );
  state.txs = state.txs ?? {};
  state.txs[key] = {
    hash,
    status: rcpt.status,
    block: Number(rcpt.blockNumber),
    gasUsed: rcpt.gasUsed.toString(),
    functionName,
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

const storage = async () =>
  (
    await fetch(
      `https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/head/context/contracts/${kt1}/storage`,
    ).then((r) => r.json())
  ).int;
console.log("counter storage before:", await storage());

// Counter must be 0 for the caught decrement to fail; Day 1 left it at 0.
await send("caught_decrement_at_zero", "decrementCaught");
await send("gas_starved_gateway", "incrementWithGas", [30_000n]);
await send("missing_entrypoint", "callMissingEntrypoint");
await send("bad_params", "callBadParams");
await send("missing_contract_valid_kt1", "callMissingContract", [randomKt1()]);
await send("malformed_destination", "callMissingContract", ["KT1notARealAddress"]);
await send("multi_cross_success", "multiCross"); // counter 0 -> 2 -> 1
await send("increment_then_fail", "incrementThenFail"); // must roll the +1 back: counter stays 1
await send("send_tez_to_tz1", "sendTez", [process.env.TEZOS_ADDRESS], parseEther("0.001"));
await send("missing_view", "readMissingView");
console.log("counter storage after:", await storage(), "(expected 1)");

#!/usr/bin/env node
// Compiles contracts/solidity/Counter.sol, deploys both contracts on Previewnet with the 0x key
// from .env, and sends the Day 1 transactions: increment (success), readView (view crossing),
// decrement (success, back to zero), decrement again (atomic revert: Michelson FAILWITH "at zero").
// Hashes are appended to fixtures/previewnet.state.json.
// Run: node --env-file=.env scripts/previewnet/02-deploy-and-call-evm.mjs
import { readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

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

// --- compile
const source = readFileSync(
  new URL("../../contracts/solidity/Counter.sol", import.meta.url),
  "utf8",
);
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "Counter.sol": { content: source } },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
);
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
const C = out.contracts["Counter.sol"];
const artifact = (name) => ({ abi: C[name].abi, bytecode: `0x${C[name].evm.bytecode.object}` });

async function deploy(name, args) {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet.deployContract({ abi, bytecode, args });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  console.log(
    `${name} deployed at ${rcpt.contractAddress} (tx ${hash}, block ${rcpt.blockNumber})`,
  );
  return { address: rcpt.contractAddress, abi, deployTx: hash, block: Number(rcpt.blockNumber) };
}

async function send(label, target, functionName, opts = {}) {
  const hash = await wallet.writeContract({
    address: target.address,
    abi: target.abi,
    functionName,
    // Explicit gas skips eth_estimateGas, which would refuse the intentionally reverting call.
    gas: 5_000_000n,
    ...opts,
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  console.log(
    `${label}: ${hash} status=${rcpt.status} block=${rcpt.blockNumber} gasUsed=${rcpt.gasUsed} logs=${rcpt.logs.length}`,
  );
  return {
    hash,
    status: rcpt.status,
    block: Number(rcpt.blockNumber),
    gasUsed: rcpt.gasUsed.toString(),
  };
}

console.log("deployer", account.address, "michelson counter", kt1);
const counter = await deploy("EvmToMichelsonCounter", [kt1]);
const reader = await deploy("CounterViewReader", [kt1]);

const txs = {};
txs.increment_success = await send("increment (success)", counter, "increment");
txs.view_success = await send("readView (view crossing)", reader, "readView");
txs.decrement_success = await send("decrement (success, back to 0)", counter, "decrement");
txs.decrement_revert = await send("decrement at zero (atomic revert)", counter, "decrement");

state.evmCounter = { address: counter.address, deployTx: counter.deployTx, block: counter.block };
state.evmViewReader = { address: reader.address, deployTx: reader.deployTx, block: reader.block };
state.txs = { ...(state.txs ?? {}), ...txs };
state.recordedAt = new Date().toISOString();
writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log("saved to fixtures/previewnet.state.json");

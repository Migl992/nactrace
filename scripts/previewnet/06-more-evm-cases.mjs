#!/usr/bin/env node
// More EVM-originated cases on the already deployed NacKitchenSink, plus a Forwarder so a crossing
// starts one EVM call deeper. Run: node --env-file=.env scripts/previewnet/06-more-evm-cases.mjs
import { readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const statePath = new URL("../../fixtures/previewnet.state.json", import.meta.url);
const state = JSON.parse(readFileSync(statePath, "utf8"));
const sink = state.kitchenSink?.address;
if (!sink) throw new Error("run 04 first");
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

const previewnet = defineChain({
  id: 128064,
  name: "Tezos X Previewnet",
  nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm.previewnet.tezosx.nomadic-labs.com"] } },
});
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const pub = createPublicClient({ chain: previewnet, transport: http() });
const wallet = createWalletClient({ account, chain: previewnet, transport: http() });

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
const sinkAbi = out.contracts["KitchenSink.sol"]["NacKitchenSink"].abi;
const fwd = out.contracts["KitchenSink.sol"]["Forwarder"];

if (!state.forwarder?.address) {
  const hash = await wallet.deployContract({
    abi: fwd.abi,
    bytecode: `0x${fwd.evm.bytecode.object}`,
    args: [sink],
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  state.forwarder = {
    address: rcpt.contractAddress,
    deployTx: hash,
    block: Number(rcpt.blockNumber),
  };
  save();
  console.log(`Forwarder deployed at ${rcpt.contractAddress}`);
}

async function send(key, address, abi, functionName, args = []) {
  if (state.txs?.[key]?.hash) return console.log(`${key}: already sent ${state.txs[key].hash}`);
  const hash = await wallet.writeContract({ address, abi, functionName, args, gas: 8_000_000n });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  console.log(
    `${key}: ${hash} status=${rcpt.status} block=${rcpt.blockNumber} gasUsed=${rcpt.gasUsed} logs=${rcpt.logs.length}`,
  );
  state.txs[key] = {
    hash,
    status: rcpt.status,
    block: Number(rcpt.blockNumber),
    gasUsed: rcpt.gasUsed.toString(),
    functionName,
  };
  save();
}

const storage = async () =>
  (
    await fetch(
      `https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/head/context/contracts/${state.michelsonCounter.address}/storage`,
    ).then((r) => r.json())
  ).int;
console.log("counter before:", await storage());
await send("evm_plain_revert", sink, sinkAbi, "boom"); // no crossing, revert("boom from EVM")
await send("evm_custom_error", sink, sinkAbi, "boomCustom"); // no crossing, custom error Boom(42)
await send("evm_revert_after_crossing", sink, sinkAbi, "incrementThenBoom"); // crossing ok, then revert
await send("forwarded_multi_cross", state.forwarder.address, fwd.abi, "forwardMultiCross"); // EOA -> fwd -> sink -> gateway x3
await send(
  "forwarded_missing_entrypoint",
  state.forwarder.address,
  fwd.abi,
  "forwardMissingEntrypoint",
); // nested failure
console.log("counter after:", await storage());

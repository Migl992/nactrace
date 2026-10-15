#!/usr/bin/env node
// Deeper outcome matrix on Previewnet (both sides, in a deliberate order so the counter value is
// right for each case). Run: node --env-file=.env scripts/previewnet/07-deeper-cases.mjs
import { readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  keccak256,
  stringToBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { LocalForger } from "@taquito/local-forging";

const RPC_M = "https://michelson.previewnet.tezosx.nomadic-labs.com";
const GATEWAY_M = "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw";
const statePath = new URL("../../fixtures/previewnet.state.json", import.meta.url);
const state = JSON.parse(readFileSync(statePath, "utf8"));
const kt1 = state.michelsonCounter.address;
const sink = state.kitchenSink.address;
state.txs = state.txs ?? {};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

// ---- EVM side
const previewnet = defineChain({
  id: 128064,
  name: "Tezos X Previewnet",
  nativeCurrency: { name: "XTZ", symbol: "XTZ", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm.previewnet.tezosx.nomadic-labs.com"] } },
});
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const pub = createPublicClient({ chain: previewnet, transport: http() });
const wallet = createWalletClient({ account, chain: previewnet, transport: http() });

function compile(file, name) {
  const source = readFileSync(new URL(`../../contracts/solidity/${file}`, import.meta.url), "utf8");
  const out = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { [file]: { content: source } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
    ),
  );
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  return out.contracts[file][name];
}

async function sendEvm(key, address, abi, functionName, args = [], value = 0n) {
  if (state.txs[key]?.hash) return console.log(`${key}: already sent ${state.txs[key].hash}`);
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName,
    args,
    value,
    gas: 8_000_000n,
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  console.log(
    `${key}: ${hash} status=${rcpt.status} block=${rcpt.blockNumber} logs=${rcpt.logs.length}`,
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

// ---- Michelson side
const tezos = new TezosToolkit(RPC_M);
const signer = new InMemorySigner(process.env.TEZOS_SECRET_KEY);
tezos.setProvider({ signer });
const pkh = await signer.publicKeyHash();
const forger = new LocalForger();
const storage = async () => (await tezos.rpc.getStorage(kt1)).int;

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

async function sendOk(key, params) {
  if (state.txs[key]?.opHash) return console.log(`${key}: already sent ${state.txs[key].opHash}`);
  const op = await tezos.contract.transfer({ fee: 8000, ...params });
  await op.confirmation(1);
  console.log(`${key}: ${op.hash} level=${op.includedInBlock} status=${op.status}`);
  state.txs[key] = { opHash: op.hash, level: op.includedInBlock, status: op.status };
  save();
}

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
  const { sbytes } = await signer.sign(forged, new Uint8Array([3]));
  const hash = await tezos.rpc.injectOperation(sbytes);
  console.log(`${key}: injected ${hash}, waiting…`);
  for (let level = head + 1, tries = 0; tries < 30; tries++) {
    const block = await tezos.rpc.getBlock({ block: String(level) }).catch(() => null);
    if (!block) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const found = block.operations.flat().find((o) => o.hash === hash);
    if (found) {
      const status = found.contents[0]?.metadata?.operation_result?.status;
      console.log(`${key}: included at ${level} status=${status}`);
      state.txs[key] = { opHash: hash, level, status };
      save();
      return;
    }
    level++;
  }
  console.log(`${key}: NOT included in 30 blocks`);
  state.txs[key] = { opHash: hash, notIncluded: true };
  save();
}

async function originate(key, file, init) {
  if (state[key]?.address) return console.log(`${key}: already at ${state[key].address}`);
  const code = readFileSync(new URL(`../../contracts/michelson/${file}`, import.meta.url), "utf8");
  const op = await tezos.contract.originate({ code, init, fee: 4000 });
  await op.confirmation(1);
  state[key] = {
    address: op.contractAddress,
    originationOpHash: op.hash,
    level: op.includedInBlock,
  };
  save();
  console.log(`${key}: ${op.contractAddress}`);
}

// ---- sequence
console.log("counter before:", await storage());
const sink2 = compile("KitchenSink2.sol", "NacKitchenSink2");
if (!state.kitchenSink2?.address) {
  const hash = await wallet.deployContract({
    abi: sink2.abi,
    bytecode: `0x${sink2.evm.bytecode.object}`,
    args: [kt1],
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  state.kitchenSink2 = {
    address: rcpt.contractAddress,
    deployTx: hash,
    block: Number(rcpt.blockNumber),
  };
  save();
  console.log(`NacKitchenSink2 at ${rcpt.contractAddress}`);
}
const S2 = state.kitchenSink2.address;

await sendEvm("increment_with_value", S2, sink2.abi, "incrementWithValue", [], parseEther("0.001")); // +1
await sendEvm("view_then_increment", S2, sink2.abi, "readThenIncrement"); // +1
await sendOk("plain_michelson_reset", {
  to: kt1,
  amount: 0,
  parameter: { entrypoint: "reset", value: { prim: "Unit" } },
}); // -> 0
await sendEvm("caught_then_increment", S2, sink2.abi, "caughtThenIncrement"); // decrement fails (caught), increment -> 1

await originate("evmViewer", "evmviewer.tz", { prim: "None" });
await originate("failingReceiver", "failing_receiver.tz", { bytes: "" });
const pingSelector = keccak256(stringToBytes("ping()")).slice(2, 10);
await sendOk("m_staticcall_evm_view", {
  to: state.evmViewer.address,
  amount: 0,
  parameter: {
    entrypoint: "default",
    value: { prim: "Pair", args: [{ string: sink }, { bytes: pingSelector }] },
  },
});
await sendOk("m_multi_cross", {
  to: GATEWAY_M,
  amount: 0,
  parameter: { entrypoint: "call_evm", value: callEvm(sink, "multiCross()") },
}); // 1 -> 3 -> 2
await sendRaw("m_callback_fails", {
  to: GATEWAY_M,
  entrypoint: "call_evm",
  value: callEvm(sink, "ping()", "", state.failingReceiver.address),
});
console.log("counter after:", await storage(), "(expected 2)");

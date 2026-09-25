import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import { LocalForger } from "@taquito/local-forging";
import { readFileSync } from "node:fs";
const RPC = "https://michelson.previewnet.tezosx.nomadic-labs.com";
const GATEWAY = "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw";
const state = JSON.parse(readFileSync("C:/dev/tezos/fixtures/previewnet.state.json", "utf8"));
const sink = state.kitchenSink.address;
const tezos = new TezosToolkit(RPC);
const signer = new InMemorySigner(process.env.TEZOS_SECRET_KEY);
tezos.setProvider({ signer });
const pkh = await signer.publicKeyHash();
const callEvm = (dest, sig) => ({
  prim: "Pair",
  args: [
    { string: dest },
    {
      prim: "Pair",
      args: [{ string: sig }, { prim: "Pair", args: [{ bytes: "" }, { prim: "None" }] }],
    },
  ],
});

console.log("== 1. Taquito transfer of boom() (expect simulation error) ==");
try {
  const op = await tezos.contract.transfer({
    to: GATEWAY,
    amount: 0,
    fee: 8000,
    parameter: { entrypoint: "call_evm", value: callEvm(sink, "boom()") },
  });
  console.log("unexpectedly injected", op.hash);
} catch (e) {
  console.log("error name:", e.name, "| id:", e.id, "| message:", String(e.message).slice(0, 600));
  if (e.errors) console.log("errors:", JSON.stringify(e.errors).slice(0, 1200));
  if (e.body) console.log("body:", String(e.body).slice(0, 1200));
}

console.log("== 2. raw-inject ping() with the same code path as the failing ops ==");
const forger = new LocalForger();
const branch = await tezos.rpc.getBlockHash();
const head = (await tezos.rpc.getBlockHeader()).level;
const counter = Number((await tezos.rpc.getContract(pkh)).counter);
const contents = [
  {
    kind: "transaction",
    source: pkh,
    fee: "20000",
    counter: String(counter + 1),
    gas_limit: "120000",
    storage_limit: "1000",
    amount: "0",
    destination: GATEWAY,
    parameters: { entrypoint: "call_evm", value: callEvm(sink, "ping()") },
  },
];
try {
  const pre = await tezos.rpc
    .preapplyOperations([
      {
        branch,
        contents,
        protocol: (await tezos.rpc.getBlockHeader()).protocol,
        signature:
          "edsigtXomBKi5CTRf5cjATJWSyaRvhfYNHqSUGrn4SdbYRcGwQrUGjzEfQDTuqHhuA8b2d8bB3jdkkkgUV5mrJ9xtc5qh4jXHE",
      },
    ])
    .catch((e) => ({ err: e.message?.slice(0, 500), body: e.body }));
  console.log("preapply(unsigned dummy sig):", JSON.stringify(pre).slice(0, 800));
} catch (e) {
  console.log("preapply threw", e.message);
}
const forged = await forger.forge({ branch, contents });
const { sbytes } = await signer.sign(forged, new Uint8Array([3]));
const hash = await tezos.rpc
  .injectOperation(sbytes)
  .catch((e) => "REFUSED " + e.message?.slice(0, 300));
console.log("inject:", hash);
for (let level = head + 1, tries = 0; tries < 25 && !String(hash).startsWith("REFUSED"); tries++) {
  const ops = await tezos.rpc.getOperationsFromBlock(String(level)).catch(() => null);
  if (!ops) {
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }
  const f = ops.flat().find((o) => o.hash === hash);
  if (f) {
    console.log(
      "included at",
      level,
      "status",
      f.contents[0]?.metadata?.operation_result?.status,
      "milligas",
      f.contents[0]?.metadata?.operation_result?.consumed_milligas,
    );
    break;
  }
  level++;
}

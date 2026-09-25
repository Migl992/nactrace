// Every edge case produced on Previewnet by scripts/previewnet/04-kitchen-sink.mjs and
// 05-michelson-cases.mjs, replayed from fixtures/raw. One test per behaviour nactrace must explain.
import { describe, expect, it } from "vitest";
import { replayProvider } from "./test-utils/replay.js";
import { buildTrace } from "./trace.js";
import { walkNodes, type Trace, type TraceNode } from "./types.js";

const H = {
  caughtPathSuccess: "0x3ad0cb8d4816a3d1754127626d81980fbe4f6ebc25daa04d67a0ebefb468bc7b",
  caughtAtZero: "0x7db675f6db248befb77d063408237bfad74890dd0079531e10e891df957cfb4f",
  gasStarved: "0xbb967b97a2e6bc057348904aea3c64a46a90375c8f604d7b00f689a3b5f6b186",
  missingEntrypoint: "0x979a31b6c5d2ea82676683f85a529663ef5c031342bd8fed1fb21335647e992e",
  badParams: "0xbe4dff3d0e9ef05e763b313940c4b4231b5f95239bf20d313039c8a1f833f5e0",
  missingContract: "0x5badb9bba526db4a51cc8acbc4e3cef37fea635566c6c95faa393c5220add6bf",
  malformedDestination: "0xac0f433043594b55b9f021ef7c5a4649bbc146b11a9627868bcd15292d5fe79a",
  multiCross: "0x6f7f2bd295accb10139bb5bfd669a2bc1217f8d64cf7058e3624394195271b79",
  incrementThenFail: "0xbe234e900a1f0ccdc93f02761f14b85051e0c45149ff1c2ba05d68abf45bb6d4",
  sendTez: "0x21cd191f45b4af9b0cfd347612464f79ea145a16771097425b96151017fba9a9",
  missingView: "0xf510137271323e0f2e9f9665e96da1822872e0a5bc9c6feb7312d3fc8e3febbf",
  plainMichelson: "ooGF66xEtEXZBcng6c3jugend1mD5Uodt97Zrirf9BZAXMW9Wtf",
  plainMichelsonFailure: "ooY5Aihm9QBkvC92ZD6Ex2pcoDHJBSw6xpzDftHULELWQKk1br8",
  ping: "op3Gs43yVx5eBF288LAH9oMw2mEEdVRKodM7qYdFfpa3hXxNtai",
  pingWithCallback: "opLPk4XK2PjSieAqGRdweeb6GWFvTTNu4vnTbzQNL3fQKnRHvuQ",
  transferToEvmUser: "op7nAGUztKRC4QFtUhyej5CNJqrDLSMQVMwg1x94Q9eRT6qq6gY",
  pingRaw: "onmRggbbEU7kiQEXVGzCGBPJKEF4cPjDpLWSM31isFXowo3Zoym",
  counter: "KT1LT2vXbnTvjjsfZJQnArm21orXLsh95Tgv",
  sink: "0xb8a44c2e9148e0bc1996b6122f1aec43f7970908",
} as const;

const nodes = (t: Trace) => [...walkNodes(t.root)].map((x) => x.node);
const crossings = (t: Trace) => nodes(t).filter((n) => n.kind === "crossing");

/** Some hashes were recorded while 0xTzKT lagged; buildTrace then needs the RPC-only path. */
async function build(hash: string, level?: number): Promise<Trace> {
  const provider = replayProvider();
  try {
    return await buildTrace(hash, { provider, ...(level ? { level } : {}) });
  } catch (e) {
    if (!String((e as Error).message).includes("0xTzKT does not know")) throw e;
    return buildTrace(hash, {
      provider,
      network: "previewnet",
      useXtzkt: false,
      ...(level ? { level } : {}),
    });
  }
}

describe("EVM-originated edge cases", () => {
  it("caught revert: tx succeeds, the crossing is reverted, status partially_caught", async () => {
    const t = await build(H.caughtAtZero);
    expect(t.status).toBe("partially_caught");
    expect(t.atomic).toBe(false);
    expect(t.root.status).toBe("success");
    const [c] = crossings(t);
    expect(c?.status).toBe("reverted");
    expect(c?.raw?.["caughtByCaller"]).toBe(true);
    expect(t.explanation.failedNodeId).toBe(c?.id);
    expect(t.explanation.summary).toMatch(
      /succeeded, but its cross-runtime call to Michelson %decrement on KT1LT…5Tgv failed with FAILWITH "at zero" and the caller caught the revert; only that leg was rolled back\.$/,
    );
  });

  it("the same low-level call path when the crossing succeeds is a plain success", async () => {
    const t = await build(H.caughtPathSuccess);
    expect(t.status).toBe("success");
    expect(crossings(t)[0]?.storageDiff).toEqual({ before: { int: "1" }, after: { int: "0" } });
  });

  it("gas-starved gateway frame: out of gas on the Michelson side", async () => {
    const t = await build(H.gasStarved);
    expect(t.status).toBe("reverted");
    const [c] = crossings(t);
    expect((c?.michelsonError as { error_message?: string })?.error_message).toContain("OutOfGas");
    expect(t.explanation.summary).toContain("%increment of KT1LT…5Tgv failed with out of gas");
  });

  it("missing entrypoint", async () => {
    const t = await build(H.missingEntrypoint);
    expect(t.status).toBe("reverted");
    expect(crossings(t)[0]?.entrypoint).toBe("nope");
    expect(t.explanation.summary).toContain(
      "%nope of KT1LT…5Tgv failed with failed typechecking input: no such entrypoint: nope",
    );
  });

  it("ill-typed parameter", async () => {
    const t = await build(H.badParams);
    expect(t.status).toBe("reverted");
    expect(t.explanation.summary).toContain('value String("hi") is invalid for type Unit');
  });

  it("destination never originated", async () => {
    const t = await build(H.missingContract);
    expect(t.status).toBe("reverted");
    expect(t.explanation.summary).toMatch(/failed with contract KT1\w+ does not exist/);
  });

  it("malformed destination: rejected by the gateway before crossing, no Michelson leg", async () => {
    const t = await build(H.malformedDestination);
    expect(t.status).toBe("reverted");
    expect(crossings(t)).toHaveLength(0);
    expect(t.meta.warnings).toEqual([]);
    expect(t.explanation.summary).toContain(
      "the NAC gateway rejected the call with Invalid Tezos address in URL: KT1notARealAddress: invalid base58 (gateway status 400 Bad Request); nothing crossed.",
    );
  });

  it("three crossings in one tx, each with its own frame gas and milligas", async () => {
    const t = await build(H.multiCross);
    expect(t.status).toBe("success");
    const cs = crossings(t);
    expect(cs.map((c) => c.entrypoint)).toEqual(["increment", "increment", "decrement"]);
    for (const c of cs) {
      expect(c.gas?.used).toMatch(/^\d+$/);
      expect(c.michelsonGas?.used).toMatch(/^\d+$/);
      expect(c.events.map((e) => e.name)).toEqual(["CrossRuntimeCallSent"]);
    }
    expect(cs[0]?.storageDiff).toEqual({ before: { int: "0" }, after: { int: "1" } });
    expect(t.explanation.summary).toContain("all 3 legs applied");
  });

  it("second crossing fails: the first one is reported as rolled back too", async () => {
    const t = await build(H.incrementThenFail);
    expect(t.status).toBe("reverted");
    const cs = crossings(t);
    expect(cs.map((c) => c.status)).toEqual(["backtracked", "reverted"]);
    expect(t.explanation.failedNodeId).toBe(cs[1]?.id);
    expect(t.explanation.summary).toMatch(/including 1 earlier leg that had applied\.$/);
    expect(cs[0]?.storageDiff).toEqual({ before: { int: "1" }, after: { int: "1" } });
  });

  it("value transfer to a Michelson user through the gateway", async () => {
    const t = await build(H.sendTez);
    expect(t.status).toBe("success");
    const [c] = crossings(t);
    expect(c?.to.value).toBe("tz1Tj26he8NbyEuiMGZerWUYCXNnzkvTA3Mh");
    expect(c?.value).toBe("1000000000000000 wei");
    expect(c?.entrypoint).toBe("default");
    expect(t.explanation.summary).toContain("with 0.001 XTZ");
  });

  it("missing view: a reverted view node without output", async () => {
    const t = await build(H.missingView);
    expect(t.status).toBe("reverted");
    const view = nodes(t).find((n) => n.kind === "view")!;
    expect(view.status).toBe("reverted");
    expect(view.output).toBeUndefined();
    expect(t.explanation.summary).toContain(
      'Michelson view nope of KT1LT…5Tgv failed with view "nope" not found',
    );
  });
});

describe("Michelson-originated edge cases", () => {
  it("plain Michelson op without crossing: no EVM lookups, no warnings", async () => {
    const t = await build(H.plainMichelson);
    expect(t.status).toBe("success");
    expect(nodes(t)).toHaveLength(1);
    expect(t.meta.warnings).toEqual([]);
    expect(t.meta.sources.some((s) => s.method.startsWith("eth_"))).toBe(false);
    expect(t.explanation.summary).toMatch(/%decrement applied without crossing runtimes\.$/);
  });

  it("plain Michelson op that fails (RPC-only, level given): root reverted with FAILWITH", async () => {
    const t = await build(H.plainMichelsonFailure, 1047288);
    expect(t.meta.source).toBe("rpc_only");
    expect(t.status).toBe("reverted");
    expect(t.root.error).toBe('FAILWITH "at zero"');
    expect(t.meta.warnings).toEqual([]);
    expect(t.explanation.summary).toMatch(
      /reverted: FAILWITH "at zero"; no cross-runtime leg failed\.$/,
    );
  });

  it("call_evm success with the return value discarded", async () => {
    const t = await build(H.ping);
    expect(t.status).toBe("success");
    const [leg] = crossings(t);
    expect(leg?.entrypoint).toBe("ping()");
    expect(leg?.to.value).toBe(H.sink);
    expect(nodes(t).some((n) => n.kind === "callback")).toBe(false);
  });

  it("call_evm with a callback: the return bytes reach the receiver contract", async () => {
    const t = await build(H.pingWithCallback);
    expect(t.status).toBe("success");
    expect(t.meta.warnings).toEqual([]);
    const cb = nodes(t).find((n) => n.kind === "callback") as TraceNode;
    expect(cb).toBeDefined();
    expect(cb.from.role).toBe("gateway");
    expect(cb.to.value).toBe("KT1QopYiQdyhkjn4mxUvC4u1ci6UzgE7mEDp");
    expect(cb.michelsonGas?.used).toMatch(/^\d+$/);
    expect(t.explanation.summary).toContain("return value delivered to KT1Qo…mEDp by callback");
  });

  it("call_evm value transfer to an EVM user", async () => {
    const t = await build(H.transferToEvmUser);
    const [leg] = crossings(t);
    expect(leg?.entrypoint).toBeUndefined();
    expect(leg?.value).toBe("1000 mutez");
    expect(leg?.to.value).toBe("0x2caddb07bb2893c85f48a58e9e605bdb96f787b3");
    expect(t.explanation.summary).toContain("EVM transfer on 0x2cad…87b3 with 0.001 XTZ");
  });

  it("RPC-only path names the EVM target and signature from the op parameters", async () => {
    const t = await build(H.pingRaw, 1047340);
    expect(t.meta.source).toBe("rpc_only");
    const [leg] = crossings(t);
    expect(leg?.entrypoint).toBe("ping()");
    expect(leg?.to.value).toBe(H.sink);
    expect(leg?.from.role).toBe("alias");
    expect(t.explanation.summary).toContain("crossed into EVM ping() on 0xb8a4…0908");
  });
});

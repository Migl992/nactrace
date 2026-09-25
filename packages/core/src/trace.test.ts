import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAINNET, PREVIEWNET, replayProvider } from "./test-utils/replay.js";
import { buildTrace } from "./trace.js";
import { walkNodes, type Trace } from "./types.js";

const TRACES_ROOT = fileURLToPath(new URL("../../../fixtures/traces", import.meta.url));

/** Compare against fixtures/traces/<network>/<hash>.json; UPDATE_TRACES=1 rewrites them. */
function expectSnapshot(trace: Trace, hash: string) {
  const file = join(TRACES_ROOT, trace.network, `${hash}.json`);
  const meta: Partial<Trace["meta"]> = { ...trace.meta };
  delete meta.fetchedAt;
  delete meta.xtzktSchemaObservedAt;
  const stable = { ...trace, meta };
  if (process.env["UPDATE_TRACES"] || !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(stable, null, 2) + "\n");
    return;
  }
  expect(stable).toEqual(JSON.parse(readFileSync(file, "utf8")));
}

const nodes = (t: Trace) => [...walkNodes(t.root)].map((x) => x.node);

describe("buildTrace (replayed fixtures)", () => {
  it("EVM -> Michelson success: root tx, one crossing, storage diff, gas in both units", async () => {
    const t = await buildTrace(PREVIEWNET.incrementSuccess, { provider: replayProvider() });
    expect(t.network).toBe("previewnet");
    expect(t.status).toBe("success");
    expect(t.meta.source).toBe("xtzkt+rpc");
    expect(t.meta.warnings).toEqual([]);
    expect(t.root.kind).toBe("tx");
    expect(t.root.status).toBe("success");
    const crossing = nodes(t).find((n) => n.kind === "crossing")!;
    expect(crossing.runtime).toBe("michelson");
    expect(crossing.to.value).toBe(PREVIEWNET.michelsonCounter);
    expect(crossing.entrypoint).toBe("increment");
    expect(crossing.synthetic).toBe(true);
    expect(crossing.hash).toBe("op7w99uHZNVjvQUz1YtWdWFADykSPzB3KEqrR7jd7SinogyCEtQ");
    expect(crossing.gas).toEqual({ used: "848010", unit: "evm_gas" });
    expect(crossing.michelsonGas).toEqual({ used: "1020575", unit: "michelson_milligas" });
    expect(crossing.storageDiff).toEqual({ before: { int: "0" }, after: { int: "1" } });
    expect(crossing.events.map((e) => e.name)).toEqual(["CrossRuntimeCallSent"]);
    expect(crossing.events[0]?.args?.["crossRuntimeCallId"]).toBe("1-0");
    // Two KT1 aliases were originated in this first crossing.
    expect(nodes(t).filter((n) => n.kind === "alias_created")).toHaveLength(2);
    expect(t.root.from.counterpart).toBeUndefined();
    expect(crossing.from.counterpart).toBe("KT1TA7PnMEKLeGgTLXZVk1QmeRoUSzUq3XK2");
    expectSnapshot(t, PREVIEWNET.incrementSuccess);
  });

  it("atomic revert: both sides reverted, Michelson error and gateway reason exposed", async () => {
    const t = await buildTrace(PREVIEWNET.decrementRevert, { provider: replayProvider() });
    expect(t.status).toBe("reverted");
    expect(t.atomic).toBe(true);
    expect(t.root.status).toBe("reverted");
    const crossing = nodes(t).find((n) => n.kind === "crossing")!;
    expect(crossing.status).toBe("reverted");
    expect(crossing.error).toContain("Cross-runtime call failed with status 400 Bad Request");
    expect((crossing.michelsonError as { id?: string })?.id).toBe("tezlink_error");
    expect(crossing.storageDiff).toEqual({ before: { int: "0" }, after: { int: "0" } });
    expect(t.explanation.failedNodeId).toBe(crossing.id);
    expect(t.explanation.summary).toMatch(
      /^EVM tx .* reverted: Michelson entrypoint %decrement of KT1LT…5Tgv failed with FAILWITH "at zero"; whole transaction rolled back on both sides\.$/,
    );
    expectSnapshot(t, PREVIEWNET.decrementRevert);
  });

  it("view: a read-only leg with decoded output and no Michelson op", async () => {
    const t = await buildTrace(PREVIEWNET.viewSuccess, { provider: replayProvider() });
    expect(t.status).toBe("success");
    const view = nodes(t).find((n) => n.kind === "view")!;
    expect(view.entrypoint).toBe("get_counter");
    expect(view.to.value).toBe(PREVIEWNET.michelsonCounter);
    expect(view.output).toBe("0x0001");
    expect(nodes(t).some((n) => n.kind === "crossing")).toBe(false);
    expect(t.meta.warnings).toEqual([]);
    expect(t.explanation.summary).toContain(
      "read Michelson view get_counter on KT1LT…5Tgv → 0x0001",
    );
    expectSnapshot(t, PREVIEWNET.viewSuccess);
  });

  it("Michelson -> EVM -> Michelson nested crossing", async () => {
    const t = await buildTrace(PREVIEWNET.michelsonToEvmNested, { provider: replayProvider() });
    expect(t.status).toBe("success");
    expect(t.root.kind).toBe("op");
    expect(t.root.to.role).toBe("gateway");
    expect(t.root.gas?.unit).toBe("michelson_milligas");
    const [evmLeg] = t.root.children.filter((n) => n.kind === "crossing");
    expect(evmLeg?.runtime).toBe("evm");
    expect(evmLeg?.synthetic).toBe(true);
    expect(evmLeg?.entrypoint).toBe("increment()");
    expect(evmLeg?.from.counterpart).toBe("0x926e29d504dc631e4e405925361392dbe7d25909");
    // The synthetic tx receipt also carries the alias forwarder log and CounterCalled.
    expect(evmLeg?.events.map((e) => e.name)).toContain("CrossRuntimeCallReceived");
    const michLeg = evmLeg?.children.find((n) => n.kind === "crossing");
    expect(michLeg?.runtime).toBe("michelson");
    expect(michLeg?.entrypoint).toBe("increment");
    expect(michLeg?.synthetic).toBe(false);
    expect(michLeg?.michelsonGas?.used).toBe("1020575");
    expect(michLeg?.events.map((e) => e.name)).toEqual(["CrossRuntimeCallSent"]);
    expect(t.meta.warnings).toEqual([]);
    expectSnapshot(t, PREVIEWNET.michelsonToEvmNested);
  });

  it("mainnet: works without debug_traceTransaction and warns about it", async () => {
    const t = await buildTrace(MAINNET.genericCallWithValue, { provider: replayProvider() });
    expect(t.network).toBe("mainnet");
    expect(t.status).toBe("success");
    expect(t.meta.warnings.some((w) => w.includes("debug_traceTransaction unavailable"))).toBe(
      true,
    );
    const crossing = nodes(t).find((n) => n.kind === "crossing")!;
    expect(crossing.to.value).toBe("tz1boqBV6XhVjXA2i5ysZ4megxZxa2EEgyxg");
    expect(crossing.entrypoint).toBe("default");
    expect(crossing.value).toBe("20000000000000000 wei");
    expect(crossing.from.role).toBe("alias");
    expectSnapshot(t, MAINNET.genericCallWithValue);
  });

  it("mainnet: EOA calling the gateway directly yields a root tx to the gateway plus one crossing", async () => {
    const t = await buildTrace(MAINNET.genericCall, { provider: replayProvider() });
    expect(t.root.to.role).toBe("gateway");
    expect(t.root.entrypoint).toBe("callMichelson(string,string,bytes)");
    expect(t.root.children.filter((n) => n.kind === "crossing")).toHaveLength(1);
    expectSnapshot(t, MAINNET.genericCall);
  });

  it("mainnet: Michelson-originated withdrawal shows the internal EVM calls under the crossing", async () => {
    const t = await buildTrace(MAINNET.withdrawViaCallEvm, { provider: replayProvider() });
    expect(t.root.kind).toBe("op");
    const evmLeg = t.root.children.find((n) => n.kind === "crossing")!;
    expect(evmLeg.to.value).toBe("0xff00000000000000000000000000000000000001");
    expect(evmLeg.entrypoint).toBe("withdraw_base58(string)");
    expect(evmLeg.value).toBe("10000 mutez");
    expect(evmLeg.children.map((n) => n.entrypoint)).toEqual([
      "get_and_increment()",
      "push_withdrawal_to_outbox(string,uint256)",
      undefined,
    ]);
    expectSnapshot(t, MAINNET.withdrawViaCallEvm);
  });

  it("mainnet: alias-initiated generic call and direct call_evm with value", async () => {
    const p = replayProvider();
    const a = await buildTrace(MAINNET.aliasGenericCall, { provider: p });
    expect(a.root.to.role).toBe("alias");
    const aLeg = a.root.children.find((n) => n.kind === "crossing")!;
    expect(aLeg.from.role).toBe("alias");
    expect(aLeg.to.value).toBe("0x2e2ac8699ad02e710951ea0f56b892ed36916cd5");
    expect(aLeg.value).toBe("1000 mutez");
    expectSnapshot(a, MAINNET.aliasGenericCall);

    const b = await buildTrace(MAINNET.callEvmToUser, { provider: p });
    expect(b.root.to.role).toBe("gateway");
    expect(b.root.children[0]?.entrypoint).toBeUndefined();
    expect(b.explanation.summary).toContain("EVM transfer on 0x2e2a…6cd5 with 0.0001 XTZ");
    expectSnapshot(b, MAINNET.callEvmToUser);
  });

  it("accepts explorer URLs", async () => {
    const t = await buildTrace(
      `https://blockscout.previewnet.tezosx.nomadic-labs.com/tx/${PREVIEWNET.incrementSuccess}`,
      { provider: replayProvider() },
    );
    expect(t.root.hash).toBe(PREVIEWNET.incrementSuccess);
  });

  it("RPC-only fallback rebuilds the crossing from the callTracer and the Tezos block", async () => {
    const t = await buildTrace(PREVIEWNET.decrementRevert, {
      provider: replayProvider(),
      network: "previewnet",
      useXtzkt: false,
    });
    expect(t.meta.source).toBe("rpc_only");
    expect(t.meta.correlation).toBe("derived_hash");
    expect(t.status).toBe("reverted");
    const crossing = nodes(t).find((n) => n.kind === "crossing")!;
    expect(crossing.to.value).toBe(PREVIEWNET.michelsonCounter);
    expect(crossing.entrypoint).toBe("decrement");
    expect(crossing.status).toBe("reverted");
    expect((crossing.michelsonError as { id?: string })?.id).toBe("tezlink_error");
    expect(t.explanation.summary).toContain('failed with FAILWITH "at zero"');
  });

  it("RPC-only fallback for a Michelson-originated op", async () => {
    const t = await buildTrace(PREVIEWNET.michelsonToEvmNested, {
      provider: replayProvider(),
      network: "previewnet",
      useXtzkt: false,
    });
    expect(t.meta.source).toBe("rpc_only");
    expect(t.root.kind).toBe("op");
    expect(t.root.to.role).toBe("gateway");
    const evmLeg = t.root.children.find((n) => n.kind === "crossing")!;
    expect(evmLeg.runtime).toBe("evm");
    expect(evmLeg.children.find((n) => n.kind === "crossing")?.entrypoint).toBe("increment");
    expect(t.status).toBe("success");
  });
});

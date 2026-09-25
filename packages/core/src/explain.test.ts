import { describe, expect, it } from "vitest";
import { deepestFailure, explain } from "./explain.js";
import type { Trace, TraceNode } from "./types.js";

function node(partial: Partial<TraceNode> & Pick<TraceNode, "id" | "runtime" | "kind">): TraceNode {
  return {
    from: { value: "0x2caddb07bb2893c85f48a58e9e605bdb96f787b3", runtime: "evm", role: "native" },
    to: { value: "0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d", runtime: "evm", role: "native" },
    status: "success",
    events: [],
    children: [],
    links: {},
    ...partial,
  };
}

function trace(root: TraceNode, status: Trace["status"]): Trace {
  return {
    schemaVersion: "1",
    network: "previewnet",
    root,
    status,
    atomic: status === "reverted",
    explanation: { summary: "" },
    meta: {
      source: "xtzkt+rpc",
      correlation: "xtzkt_hash",
      fetchedAt: "",
      sources: [],
      warnings: [],
    },
  };
}

const KT1 = {
  value: "KT1LT2vXbnTvjjsfZJQnArm21orXLsh95Tgv",
  runtime: "michelson" as const,
  role: "native" as const,
};

describe("explain()", () => {
  it("describes a partially caught failure", () => {
    const leg = node({
      id: "n1",
      runtime: "michelson",
      kind: "crossing",
      to: KT1,
      entrypoint: "transfer",
      status: "reverted",
      error:
        'Cross-runtime call failed with status 400 Bad Request: … failed with: String("FA2_INSUFFICIENT_BALANCE") of type String',
      raw: { caughtByCaller: true },
    });
    const root = node({
      id: "n0",
      runtime: "evm",
      kind: "tx",
      hash: "0x" + "ab".repeat(32),
      children: [leg],
    });
    const e = explain(trace(root, "partially_caught"));
    expect(e.failedNodeId).toBe("n1");
    expect(e.summary).toBe(
      'EVM tx 0xabab…abab from 0x2cad…87b3 to 0x0e11…4b3d succeeded, but its cross-runtime call to Michelson %transfer on KT1LT…5Tgv failed with FAILWITH "FA2_INSUFFICIENT_BALANCE" and the caller caught the revert; only that leg was rolled back.',
    );
    expect(e.evmReason).toContain("Cross-runtime call failed");
  });

  it("describes a Michelson-originated failure whose EVM leg reverted", () => {
    const leg = node({
      id: "n1",
      runtime: "evm",
      kind: "crossing",
      from: { value: "tz1Tj26he8NbyEuiMGZerWUYCXNnzkvTA3Mh", runtime: "michelson", role: "native" },
      entrypoint: "increment()",
      status: "reverted",
      error: "execution reverted",
    });
    const root = node({
      id: "n0",
      runtime: "michelson",
      kind: "op",
      hash: "oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W",
      from: { value: "tz1Tj26he8NbyEuiMGZerWUYCXNnzkvTA3Mh", runtime: "michelson", role: "native" },
      to: { value: "KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw", runtime: "michelson", role: "gateway" },
      entrypoint: "call_evm",
      status: "reverted",
      children: [leg],
    });
    const e = explain(trace(root, "reverted"));
    expect(e.summary).toBe(
      "Tezos op oo3MF…E16W from tz1Tj…A3Mh to KT18o…qsPw (gateway) %call_evm failed: EVM call increment() on 0x0e11…4b3d reverted with execution reverted; whole operation rolled back on both sides.",
    );
  });

  it("picks the deepest failed node, root only as a last resort", () => {
    const deep = node({ id: "n2", runtime: "michelson", kind: "crossing", status: "reverted" });
    const mid = node({
      id: "n1",
      runtime: "evm",
      kind: "crossing",
      status: "reverted",
      children: [deep],
    });
    const root = node({
      id: "n0",
      runtime: "michelson",
      kind: "op",
      status: "reverted",
      children: [mid],
    });
    expect(deepestFailure(root)?.id).toBe("n2");
    const alone = node({
      id: "n0",
      runtime: "evm",
      kind: "tx",
      status: "reverted",
      error: "out of gas",
    });
    expect(deepestFailure(alone)?.id).toBe("n0");
    expect(explain(trace(alone, "reverted")).summary).toContain(
      "reverted: out of gas; no cross-runtime leg failed.",
    );
  });

  it("says so when nothing crossed", () => {
    const root = node({ id: "n0", runtime: "evm", kind: "tx" });
    expect(explain(trace(root, "success")).summary).toMatch(/applied without crossing runtimes\.$/);
  });
});

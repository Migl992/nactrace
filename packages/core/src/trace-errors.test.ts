// Fault injection: what buildTrace does when a data source is down, slow, refuses, or lies.
// Base data is replayed from fixtures/raw; faults replace individual answers.
import { describe, expect, it } from "vitest";
import { K, faultyReplay } from "./test-utils/faultyReplay.js";
import { PREVIEWNET } from "./test-utils/replay.js";
import { buildTrace } from "./trace.js";
import { walkNodes } from "./types.js";

const INC = PREVIEWNET.incrementSuccess;
const REV = PREVIEWNET.decrementRevert;
const NESTED = PREVIEWNET.michelsonToEvmNested;

describe("buildTrace under faults", () => {
  it("0xTzKT unreachable on every network: falls back to RPC-only when the network is known", async () => {
    const { provider } = faultyReplay({
      [K.xtzktPreviewnet]: { throw: "ECONNREFUSED" },
      [K.xtzktMainnet]: { throw: "ECONNREFUSED" },
      [K.xtzktShadownet]: { throw: "ECONNREFUSED" },
    });
    await expect(buildTrace(REV, { provider })).rejects.toThrow(/pass --network/);
    const t = await buildTrace(REV, { provider, network: "previewnet" });
    expect(t.meta.source).toBe("rpc_only");
    expect(t.status).toBe("reverted");
    expect(t.explanation.summary).toContain('FAILWITH "at zero"');
  });

  it("0xTzKT returns HTTP 500 on the detected network: warning + RPC-only", async () => {
    const { provider } = faultyReplay({ [K.xtzktPreviewnet]: { status: 500 } });
    const t = await buildTrace(INC, { provider, network: "previewnet" });
    expect(t.meta.source).toBe("rpc_only");
    expect(t.meta.warnings.some((w) => w.startsWith("0xTzKT unavailable"))).toBe(true);
    expect(t.status).toBe("success");
  });

  it("0xTzKT answers garbage (not an array): treated as unavailable, not a crash", async () => {
    const { provider } = faultyReplay({ [K.xtzktPreviewnet]: { body: { oops: true } } });
    const t = await buildTrace(INC, { provider, network: "previewnet" });
    expect(t.meta.source).toBe("rpc_only");
    expect(t.meta.warnings[0]).toMatch(/expected an array/);
  });

  it("EVM node down: 0xTzKT skeleton survives with warnings, no receipt-derived fields", async () => {
    const { provider } = faultyReplay({ [K.evmPreviewnet]: { throw: "ETIMEDOUT" } });
    const t = await buildTrace(INC, { provider });
    expect(t.meta.source).toBe("xtzkt+rpc");
    expect(t.status).toBe("success");
    expect(t.meta.warnings.some((w) => w.startsWith("eth_getTransactionReceipt"))).toBe(true);
    // Michelson enrichment still happened.
    const crossing = [...walkNodes(t.root)].map((x) => x.node).find((n) => n.kind === "crossing");
    expect(crossing?.michelsonGas?.used).toBe("1020575");
    expect(crossing?.storageDiff).toBeDefined();
  });

  it("debug_traceTransaction refused (as on mainnet): gas per frame comes from 0xTzKT, no crash", async () => {
    const { provider } = faultyReplay({
      [`${K.evmPreviewnet}debug_traceTransaction`]: {
        body: { error: { code: -32053, message: "API key is not allowed to access method" } },
      },
    });
    const t = await buildTrace(REV, { provider });
    expect(t.status).toBe("reverted");
    expect(t.meta.warnings).toEqual([
      "debug_traceTransaction unavailable on previewnet: API key is not allowed to access method",
    ]);
    const crossing = [...walkNodes(t.root)].map((x) => x.node).find((n) => n.kind === "crossing");
    expect(crossing?.gas?.used).toBe("30237"); // from the 0xTzKT row
    expect(t.explanation.summary).toContain('FAILWITH "at zero"');
  });

  it("Tezos node down: EVM side still explains the revert from the gateway string", async () => {
    const { provider } = faultyReplay({ [K.tezosPreviewnet]: { throw: "ECONNRESET" } });
    const t = await buildTrace(REV, { provider });
    expect(t.status).toBe("reverted");
    expect(t.meta.warnings.some((w) => w.startsWith("Tezos block"))).toBe(true);
    expect(t.meta.warnings.some((w) => w.includes("not found in Michelson block"))).toBe(true);
    expect(t.explanation.summary).toContain('failed with FAILWITH "at zero"');
    expect(t.explanation.michelsonError).toBeUndefined();
  });

  it("mirrored op missing from the block: hash-recipe warning, trace still complete", async () => {
    const { provider } = faultyReplay({
      [`${K.tezosPreviewnet}1046559/operations`]: { body: [[], [], [], []] },
    });
    const t = await buildTrace(INC, { provider });
    expect(t.status).toBe("success");
    expect(t.meta.warnings[0]).toMatch(
      /derived op hash op7w99uH.* not found in Michelson block 1046559/,
    );
  });

  it("storage endpoint failing: storage diff skipped, everything else intact", async () => {
    const { provider } = faultyReplay({
      [`${K.tezosPreviewnet}1046559/context/contracts/`]: { status: 503, body: "busy" },
    });
    const t = await buildTrace(INC, { provider });
    const crossing = [...walkNodes(t.root)].map((x) => x.node).find((n) => n.kind === "crossing");
    expect(crossing?.storageDiff).toBeUndefined();
    expect(t.meta.warnings.some((w) => w.startsWith("storage of KT1LT2"))).toBe(true);
    expect(t.status).toBe("success");
  });

  it("receipt disagrees with 0xTzKT: the receipt wins and a warning says so", async () => {
    const { provider } = faultyReplay({
      [`${K.evmPreviewnet}eth_getTransactionReceipt`]: (req) => ({
        body: {
          result: {
            transactionHash: req.kind === "rpc" ? req.params[0] : undefined,
            blockNumber: "0xff81f",
            from: "0x2caddb07bb2893c85f48a58e9e605bdb96f787b3",
            to: "0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d",
            status: "0x0",
            gasUsed: "0x1",
            logs: [],
          },
        },
      }),
      [`${K.evmPreviewnet}debug_traceTransaction`]: { body: { result: null } },
    });
    const t = await buildTrace(INC, { provider });
    expect(t.root.status).toBe("reverted");
    expect(t.meta.warnings.some((w) => w.includes("disagrees with 0xTzKT"))).toBe(true);
  });

  it("rows with unknown direction or status are ignored with warnings, never thrown", async () => {
    const { provider } = faultyReplay({
      [K.xtzktPreviewnet + INC]: (req) => {
        void req;
        return {
          body: [
            {
              direction: "x_evm",
              id: "1",
              hash: INC,
              level: 1046559,
              status: "weird",
              sender: { hash: "0x2caddb07bb2893c85f48a58e9e605bdb96f787b3", type: "x_evm_user" },
              target: {
                hash: "0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d",
                type: "x_evm_contract",
              },
            },
            { direction: "x_future", id: "2", hash: INC, level: 1046559 },
            {
              direction: "x_evm_michelson",
              id: "3",
              hash: INC,
              level: 1046559,
              status: "applied",
              sender: {
                hash: "0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d",
                type: "x_evm_contract",
              },
              target: {
                hash: "KT1LT2vXbnTvjjsfZJQnArm21orXLsh95Tgv",
                type: "x_michelson_contract",
              },
              entrypoint: "increment",
            },
          ],
        };
      },
    });
    const t = await buildTrace(INC, { provider, enrich: false });
    expect(t.meta.warnings).toEqual([
      'unknown 0xTzKT status "weird" on row 1',
      "ignored 0xTzKT row with direction x_future",
    ]);
    expect(t.root.children.map((n) => n.kind)).toEqual(["crossing"]);
  });

  it("rows missing sender/target still build a tree with '?' addresses", async () => {
    const { provider } = faultyReplay({
      [K.xtzktPreviewnet + NESTED]: {
        body: [
          {
            direction: "x_michelson_evm",
            id: "1",
            hash: NESTED,
            level: 1046583,
            status: "applied",
          },
        ],
      },
    });
    const t = await buildTrace(NESTED, { provider, enrich: false });
    expect(t.root.from.value).toBe("?");
    expect(t.root.children[0]?.to.value).toBe("?");
    expect(t.explanation.summary).toContain("crossed into EVM transfer on ?");
  });

  it("skeleton only (enrich: false) makes exactly one request", async () => {
    const { provider, calls } = faultyReplay({});
    const t = await buildTrace(INC, { provider, network: "previewnet", enrich: false });
    expect(calls).toHaveLength(1);
    expect(t.meta.sources).toHaveLength(1);
    expect(t.status).toBe("success");
  });

  it("bad input never reaches the network", async () => {
    const { provider, calls } = faultyReplay({});
    await expect(buildTrace("KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw", { provider })).rejects.toThrow(
      /not a transaction hash/,
    );
    await expect(buildTrace("", { provider })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

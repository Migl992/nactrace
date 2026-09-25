import { describe, expect, it } from "vitest";
import { MAINNET, PREVIEWNET, replayProvider } from "./test-utils/replay.js";
import { XTZKT_OBSERVED_FIELDS } from "./xtzkt.types.js";
import {
  detectNetwork,
  getTransactionRows,
  isCrossingRow,
  type XtzktTransactionRow,
} from "./xtzkt.js";

describe("0xTzKT adapter (replayed fixtures)", () => {
  it("returns one row per leg for an EVM-originated crossing", async () => {
    const rows = await getTransactionRows(
      replayProvider(),
      "previewnet",
      PREVIEWNET.incrementSuccess,
    );
    expect(rows.map((r) => r.direction)).toEqual(["x_evm", "x_evm_michelson"]);
    expect(rows.every((r) => r.hash === PREVIEWNET.incrementSuccess)).toBe(true);
    const leg = rows[1]!;
    expect(isCrossingRow(leg)).toBe(true);
    expect(leg.gateway?.hash).toBe("0xff00000000000000000000000000000000000007");
    expect(leg.gatewayEntrypoint).toBe("callMichelson(string,string,bytes)");
    expect(leg.target?.hash).toBe(PREVIEWNET.michelsonCounter);
    expect(leg.entrypoint).toBe("increment");
  });

  it("carries the decoded failure on both legs of a revert", async () => {
    const rows = await getTransactionRows(
      replayProvider(),
      "previewnet",
      PREVIEWNET.decrementRevert,
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.status).toBe("failed");
      expect(String(r.errors)).toContain('failed with: String("at zero")');
    }
  });

  it("shows a view as a static_call trace row to the gateway, not as a crossing", async () => {
    const rows = await getTransactionRows(replayProvider(), "previewnet", PREVIEWNET.viewSuccess);
    expect(rows.some(isCrossingRow)).toBe(false);
    const view = rows.find((r) => r.opCode === "static_call");
    expect(view?.entrypoint).toBe("callMichelsonView(string,string,bytes)");
    expect((view?.parameters as { viewName?: string } | undefined)?.viewName).toBe("get_counter");
  });

  it("returns x_michelson_evm then the nested x_evm_michelson leg for a Michelson-originated op", async () => {
    const rows = await getTransactionRows(
      replayProvider(),
      "previewnet",
      PREVIEWNET.michelsonToEvmNested,
    );
    expect(rows.map((r) => r.direction)).toEqual(["x_michelson_evm", "x_evm_michelson"]);
    expect(rows[0]?.gatewayEntrypoint).toBe("call_evm");
    expect(rows[1]?.initiator?.type).toBe("x_michelson_user");
  });

  it("detects the network by asking every 0xTzKT instance", async () => {
    const p = replayProvider();
    expect((await detectNetwork(p, MAINNET.withdrawViaCallEvm))?.network).toBe("mainnet");
    expect((await detectNetwork(p, PREVIEWNET.incrementSuccess))?.network).toBe("previewnet");
  });

  it("tolerates fields it has never seen", () => {
    const row = {
      direction: "x_evm_michelson",
      hash: "0x1",
      brandNewField: { nested: true },
    } as XtzktTransactionRow;
    expect(isCrossingRow(row)).toBe(true);
    expect(row["brandNewField"]).toEqual({ nested: true });
    expect(XTZKT_OBSERVED_FIELDS).toContain("gatewayParameters");
  });
});

import { describe, expect, it } from "vitest";
import { CROSS_RUNTIME_CALL_RECEIVED_TOPIC0, CROSS_RUNTIME_CALL_SENT_TOPIC0 } from "./events.js";
import {
  getTransaction,
  getTransactionReceipt,
  hexToNumber,
  traceTransaction,
  walkFrames,
} from "./evm.js";
import { syntheticEvmTxHash } from "./hashes.js";
import { MAINNET, PREVIEWNET, replayProvider } from "./test-utils/replay.js";

describe("EVM adapter (replayed fixtures)", () => {
  it("reads a receipt and finds the CrossRuntimeCallSent log", async () => {
    const r = await getTransactionReceipt(
      replayProvider(),
      "previewnet",
      PREVIEWNET.incrementSuccess,
    );
    expect(r?.status).toBe("0x1");
    expect(hexToNumber(r?.blockNumber)).toBe(1046559);
    const sent = r?.logs.find((l) => l.topics[0] === CROSS_RUNTIME_CALL_SENT_TOPIC0);
    expect(sent?.address).toBe("0xff00000000000000000000000000000000000007");
  });

  it("exposes the gateway revert reason on every frame of a callTracer trace", async () => {
    const t = await traceTransaction(replayProvider(), "previewnet", PREVIEWNET.decrementRevert);
    expect(t.frame).toBeDefined();
    const frames = [...walkFrames(t.frame!)];
    expect(frames).toHaveLength(2);
    expect(frames[1]?.frame.to).toBe("0xff00000000000000000000000000000000000007");
    for (const { frame } of frames) expect(frame.error).toContain('String("at zero")');
  });

  it("reports the mainnet public node refusing debug_traceTransaction instead of throwing", async () => {
    const t = await traceTransaction(replayProvider(), "mainnet", MAINNET.genericCallWithValue);
    expect(t.frame).toBeUndefined();
    expect(t.error?.code).toBe(-32053);
  });

  it("fetches the synthetic EVM tx of a Michelson-originated op", async () => {
    const p = replayProvider();
    const h = syntheticEvmTxHash(MAINNET.withdrawViaCallEvm);
    const tx = await getTransaction(p, "mainnet", h);
    expect(tx?.from).toBe(tx?.to);
    expect(tx?.input).toBe("0x");
    const r = await getTransactionReceipt(p, "mainnet", h);
    expect(r?.logs.some((l) => l.topics[0] === CROSS_RUNTIME_CALL_RECEIVED_TOPIC0)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { syntheticMichelsonOpHash } from "./hashes.js";
import {
  findOperation,
  firstError,
  getBlockOperations,
  getStorage,
  touchedContracts,
} from "./tezos.js";
import { PREVIEWNET, replayProvider } from "./test-utils/replay.js";

describe("Tezos RPC adapter (replayed fixtures)", () => {
  it("finds the mirrored op of an EVM tx at the same level and lists touched KT1s", async () => {
    const p = replayProvider();
    const passes = await getBlockOperations(p, "previewnet", 1046559);
    const op = findOperation(passes, syntheticMichelsonOpHash(PREVIEWNET.incrementSuccess));
    expect(op).toBeDefined();
    expect(op?.contents[0]?.metadata?.operation_result?.status).toBe("applied");
    expect(touchedContracts(op!.contents)).toContain(PREVIEWNET.michelsonCounter);
    const internals = op!.contents[0]!.metadata!.internal_operation_results!;
    expect(internals.map((i) => i.kind)).toEqual([
      "event",
      "origination",
      "origination",
      "transaction",
      "event",
    ]);
    expect(internals[0]?.tag).toBe("cross_runtime_call");
  });

  it("surfaces the Michelson error from the internal operation of a failed crossing", async () => {
    const p = replayProvider();
    const passes = await getBlockOperations(p, "previewnet", 1046562);
    const op = findOperation(passes, syntheticMichelsonOpHash(PREVIEWNET.decrementRevert))!;
    expect(op.contents[0]?.metadata?.operation_result?.status).toBe("failed");
    const err = firstError(op);
    expect(err?.id).toBe("tezlink_error");
    expect(err?.error_message).toContain('failed with: String(\\"at zero\\")');
  });

  it("reads storage before and after, and undefined for a not-yet-originated contract", async () => {
    const p = replayProvider();
    expect(await getStorage(p, "previewnet", PREVIEWNET.michelsonCounter, 1046558)).toEqual({
      int: "0",
    });
    expect(await getStorage(p, "previewnet", PREVIEWNET.michelsonCounter, 1046559)).toEqual({
      int: "1",
    });
    // Alias KT1 originated inside the crossing at 1046559 -> 404 one level earlier.
    expect(
      await getStorage(p, "previewnet", "KT1Ru5fpQjhQRNDtpS3pj7USvYPTB4cfZoxS", 1046558),
    ).toBeUndefined();
  });
});

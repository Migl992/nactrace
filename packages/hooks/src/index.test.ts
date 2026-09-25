import { describe, expect, it } from "vitest";
import { broadcastTransactions, extractHashes, networkForChainId } from "./index.js";

describe("hooks helpers", () => {
  it("maps Etherlink chain ids to networks", () => {
    expect(networkForChainId(128064)).toBe("previewnet");
    expect(networkForChainId("0x1f440")).toBe("previewnet");
    expect(networkForChainId(42793)).toBe("mainnet");
    expect(networkForChainId(1)).toBeUndefined();
  });

  it("extracts EVM and Tezos hashes from arbitrary output", () => {
    const text = `
      [FAIL] testDecrement() reverted
      tx 0x3977046F09DED41A000370BC47FF246BEFD74909EB414A4A02D14A36B017F716 mined
      see oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W and KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw
      again 0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716
    `;
    expect(extractHashes(text)).toEqual([
      "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716",
      "oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W",
    ]);
  });

  it("joins Foundry broadcast transactions with receipts and keeps the failed ones", () => {
    const broadcast = {
      transactions: [
        { hash: "0xAAAA", contractName: "Counter", function: "increment()" },
        { hash: "0xBBBB", contractName: "Counter", function: "decrement()" },
        { hash: null, contractName: "Counter", function: "reset()" },
      ],
      receipts: [
        { transactionHash: "0xaaaa", status: "0x1" },
        { transactionHash: "0xbbbb", status: "0x0" },
      ],
    };
    expect(broadcastTransactions(broadcast)).toEqual([
      { hash: "0xbbbb", status: "0x0", contractName: "Counter", function: "decrement()" },
    ]);
    expect(broadcastTransactions(broadcast, false)).toHaveLength(2);
    expect(broadcastTransactions({})).toEqual([]);
  });
});

describe("real Foundry broadcast (fixtures/foundry/run-latest.json, forge 1.8.3 on Previewnet)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const file = fileURLToPath(new URL("../../../fixtures/foundry/run-latest.json", import.meta.url));
  const broadcast = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const { broadcastChainId } = await import("./index.js");

  it("reads the chain id and keeps only the transaction that failed on chain", () => {
    expect(broadcastChainId(broadcast)).toBe(128064);
    expect(networkForChainId(broadcastChainId(broadcast)!)).toBe("previewnet");
    // forge aborts on the first on-chain failure: that tx has a hash but no receipt, the next
    // one was never sent (hash null), the deployment before it has a 0x1 receipt.
    expect(broadcastTransactions(broadcast)).toEqual([
      {
        hash: "0x94e2a1e48b83168d5c8f316a819dd47b15252250faac05f8f0bed7e1f3d06bab",
        contractName: "EvmToMichelsonCounter",
        function: "decrement()",
      },
    ]);
    expect(broadcastTransactions(broadcast, false)).toHaveLength(2);
  });
});

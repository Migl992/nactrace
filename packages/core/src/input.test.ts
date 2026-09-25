import { describe, expect, it } from "vitest";
import { parseInput } from "./input.js";

const EVM = "0x9480b2b38d6b1389cf553603bd81c3796c57e66b669b11f1bb0b00bc5b858bb1";
const OP = "oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W";

describe("parseInput", () => {
  it("accepts raw hashes", () => {
    expect(parseInput(EVM.toUpperCase().replace("0X", "0x"))).toEqual({ hash: EVM, kind: "evm" });
    expect(parseInput(` ${OP} `)).toEqual({ hash: OP, kind: "michelson" });
  });

  it("extracts hashes and a network hint from explorer URLs", () => {
    expect(parseInput(`https://blockscout.previewnet.tezosx.nomadic-labs.com/tx/${EVM}`)).toEqual({
      hash: EVM,
      kind: "evm",
      networkHint: "previewnet",
    });
    expect(parseInput(`https://explorer.etherlink.com/tx/${EVM}?tab=logs`)).toEqual({
      hash: EVM,
      kind: "evm",
      networkHint: "mainnet",
    });
    expect(parseInput(`https://tzkt.previewnet.tezosx.nomadic-labs.com/${OP}`)).toEqual({
      hash: OP,
      kind: "michelson",
      networkHint: "previewnet",
    });
    expect(
      parseInput(`https://api.shadownet.xtzkt.io/v1/operations/transaction?hash=${OP}`),
    ).toEqual({
      hash: OP,
      kind: "michelson",
      networkHint: "shadownet",
    });
  });

  it("rejects garbage", () => {
    expect(() => parseInput("KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw")).toThrow(
      /not a transaction hash/,
    );
  });
});

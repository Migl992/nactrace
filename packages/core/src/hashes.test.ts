import { describe, expect, it } from "vitest";
import {
  bytesToHex,
  decodeOpHash,
  encodeOpHash,
  isEvmTxHash,
  isMichelsonOpHash,
  syntheticEvmTxHash,
  syntheticEvmTxHashBytes,
  syntheticMichelsonOpHash,
  syntheticMichelsonOpHashBytes,
} from "./hashes.js";

// Golden vectors copied verbatim from tezosx_journal.rs (tests
// `test_synthetic_operation_hash_golden` and `test_synthetic_evm_tx_hash_golden`).
// parent_hash_bytes() = [1, 2, 3, …, 32]
const PARENT = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const GOLDEN_MICHELSON = Uint8Array.from([
  0x95, 0x79, 0x34, 0x08, 0x4c, 0x41, 0x5f, 0xf8, 0xcc, 0xab, 0xf8, 0x6a, 0x2a, 0xf0, 0x7d, 0xb6,
  0xcc, 0x55, 0x7c, 0xf7, 0x59, 0xe7, 0xaa, 0x50, 0xd1, 0x67, 0x3b, 0xf4, 0x8c, 0x39, 0xcc, 0xc5,
]);
const GOLDEN_EVM = Uint8Array.from([
  0x5e, 0x02, 0x87, 0x13, 0x6d, 0xd2, 0xa9, 0x6e, 0x55, 0xaa, 0xd4, 0x95, 0xed, 0xcc, 0x32, 0x9a,
  0xfc, 0x57, 0xdf, 0x76, 0xe8, 0x96, 0xe2, 0x9c, 0x42, 0xe1, 0xf8, 0x0d, 0x9d, 0xa7, 0xde, 0xb4,
]);

describe("mirrored hashes (golden vectors from tezosx_journal.rs)", () => {
  it("blake2b-256('michelson' ++ parent) matches the kernel golden vector", () => {
    expect(syntheticMichelsonOpHashBytes(PARENT)).toEqual(GOLDEN_MICHELSON);
    expect(syntheticMichelsonOpHashBytes(bytesToHex(PARENT))).toEqual(GOLDEN_MICHELSON);
  });

  it("keccak256('evm' ++ parent) matches the kernel golden vector", () => {
    expect(syntheticEvmTxHashBytes(PARENT)).toEqual(GOLDEN_EVM);
    expect(syntheticEvmTxHash(encodeOpHash(PARENT))).toBe(bytesToHex(GOLDEN_EVM));
  });

  it("the two derivations do not collide", () => {
    expect(syntheticMichelsonOpHashBytes(PARENT)).not.toEqual(syntheticEvmTxHashBytes(PARENT));
  });

  it("op hash base58check round-trips", () => {
    const encoded = syntheticMichelsonOpHash(PARENT);
    expect(encoded.startsWith("o")).toBe(true);
    expect(encoded).toHaveLength(51);
    expect(decodeOpHash(encoded)).toEqual(GOLDEN_MICHELSON);
  });

  it("decodes a real mainnet op hash and rejects a corrupted one", () => {
    const real = "opZX4Z3TuidPmJDB93WatMNKBfbkDQipUXvFiVeS6LY9JiovffV";
    expect(decodeOpHash(real)).toHaveLength(32);
    expect(encodeOpHash(decodeOpHash(real))).toBe(real);
    expect(() => decodeOpHash(real.slice(0, -1) + "W")).toThrow();
  });

  it("classifies hash strings", () => {
    expect(isEvmTxHash("0xc5e137c2ba6016f2dc7170edbf1dc03e0e7599174502f09c3e1e1d6715c8a57a")).toBe(
      true,
    );
    expect(isEvmTxHash("c5e137")).toBe(false);
    expect(isMichelsonOpHash("opZX4Z3TuidPmJDB93WatMNKBfbkDQipUXvFiVeS6LY9JiovffV")).toBe(true);
    expect(isMichelsonOpHash("KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw")).toBe(false);
  });
});

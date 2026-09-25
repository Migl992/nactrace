// Mirrored (synthetic) hashes between the two Tezos X runtimes.
// Source: etherlink/kernel_latest/tezosx-journal/src/tezosx_journal.rs (tezos/tezos, master, 2026-09-25):
//   synthetic_operation_hash(evm_tx_hash) = blake2b-256("michelson" ++ evm_tx_hash)
//   synthetic_evm_tx_hash(op_hash)        = keccak256("evm" ++ op_hash)
// Whichever side actually ran keeps its real hash; the counterpart is derived. The two are
// one-way and not inverses of each other.
import { blake2b } from "@noble/hashes/blake2b";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";

const MICHELSON_TAG = new TextEncoder().encode("michelson");
const EVM_TAG = new TextEncoder().encode("evm");

/** Tezos base58check prefix for operation hashes ("o…", 51 chars). */
const OP_HASH_PREFIX = Uint8Array.from([5, 116]);

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) throw new Error(`invalid hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return `0x${s}`;
}

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`invalid base58 char: ${c}`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** base58check-encode a raw 32-byte operation hash as "o…". */
export function encodeOpHash(raw: Uint8Array): string {
  if (raw.length !== 32) throw new Error(`op hash must be 32 bytes, got ${raw.length}`);
  const payload = concat(OP_HASH_PREFIX, raw);
  const check = sha256(sha256(payload)).slice(0, 4);
  return base58Encode(concat(payload, check));
}

/** Decode an "o…" operation hash to its raw 32 bytes. Throws on bad prefix or checksum. */
export function decodeOpHash(opHash: string): Uint8Array {
  const full = base58Decode(opHash);
  if (full.length !== 2 + 32 + 4) throw new Error(`invalid op hash length for ${opHash}`);
  const payload = full.slice(0, 34);
  const check = full.slice(34);
  const expected = sha256(sha256(payload)).slice(0, 4);
  if (!expected.every((b, i) => b === check[i])) throw new Error(`bad checksum in ${opHash}`);
  if (payload[0] !== OP_HASH_PREFIX[0] || payload[1] !== OP_HASH_PREFIX[1]) {
    throw new Error(`not an operation hash prefix: ${opHash}`);
  }
  return payload.slice(2);
}

/** Raw 32 bytes of the synthetic Michelson op hash for an EVM-originated crossing. */
export function syntheticMichelsonOpHashBytes(evmTxHash: Uint8Array | string): Uint8Array {
  const parent = typeof evmTxHash === "string" ? hexToBytes(evmTxHash) : evmTxHash;
  if (parent.length !== 32) throw new Error(`evm tx hash must be 32 bytes, got ${parent.length}`);
  return blake2b(concat(MICHELSON_TAG, parent), { dkLen: 32 });
}

/** "o…" synthetic Michelson op hash for an EVM-originated crossing. */
export function syntheticMichelsonOpHash(evmTxHash: Uint8Array | string): string {
  return encodeOpHash(syntheticMichelsonOpHashBytes(evmTxHash));
}

/** Raw 32 bytes of the synthetic EVM tx hash for a Michelson-originated crossing. */
export function syntheticEvmTxHashBytes(opHash: Uint8Array | string): Uint8Array {
  const parent = typeof opHash === "string" ? decodeOpHash(opHash) : opHash;
  if (parent.length !== 32) throw new Error(`op hash must be 32 bytes, got ${parent.length}`);
  return keccak_256(concat(EVM_TAG, parent));
}

/** "0x…" synthetic EVM tx hash for a Michelson-originated crossing. */
export function syntheticEvmTxHash(opHash: Uint8Array | string): `0x${string}` {
  return bytesToHex(syntheticEvmTxHashBytes(opHash));
}

export function isEvmTxHash(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

export function isMichelsonOpHash(s: string): boolean {
  if (!/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(s)) return false;
  try {
    decodeOpHash(s);
    return true;
  } catch {
    return false;
  }
}

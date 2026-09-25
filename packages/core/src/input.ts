// Accepts a raw hash or an explorer URL (Blockscout, TzKT, 0xTzKT) containing one (SPEC §4).
import { isEvmTxHash, isMichelsonOpHash } from "./hashes.js";
import type { NetworkName } from "./networks.js";

export interface ParsedInput {
  hash: string;
  kind: "evm" | "michelson";
  /** Network guessed from the URL host, if any. */
  networkHint?: NetworkName;
}

const EVM_RE = /0x[0-9a-fA-F]{64}/;
const OP_RE = /\bo[1-9A-HJ-NP-Za-km-z]{50}\b/;

export function parseInput(input: string): ParsedInput {
  const s = input.trim();
  if (isEvmTxHash(s)) return { hash: s.toLowerCase(), kind: "evm" };
  if (isMichelsonOpHash(s)) return { hash: s, kind: "michelson" };

  const evm = EVM_RE.exec(s)?.[0];
  const op = OP_RE.exec(s)?.[0];
  const hint = networkHintFromUrl(s);
  if (evm)
    return hint
      ? { hash: evm.toLowerCase(), kind: "evm", networkHint: hint }
      : { hash: evm.toLowerCase(), kind: "evm" };
  if (op && isMichelsonOpHash(op))
    return hint
      ? { hash: op, kind: "michelson", networkHint: hint }
      : { hash: op, kind: "michelson" };
  throw new Error(`not a transaction hash, operation hash or explorer URL: ${input}`);
}

export function networkHintFromUrl(s: string): NetworkName | undefined {
  let host: string;
  try {
    host = new URL(s).host.toLowerCase();
  } catch {
    return undefined;
  }
  if (host.includes("previewnet")) return "previewnet";
  if (host.includes("shadownet")) return "shadownet";
  if (host.includes("etherlink") || host.includes("xtzkt.io") || host.includes("tzkt.io")) {
    return "mainnet";
  }
  return undefined;
}

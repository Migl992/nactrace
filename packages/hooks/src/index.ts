// Shared helpers for the Hardhat task and the Foundry script. Both stay thin: they find a hash
// and hand it to the nactrace CLI (SPEC §7).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { NETWORKS, Provider, type NetworkName } from "@nactrace/core";

export interface RecentTx {
  hash: string;
  status: string;
  level: number;
  direction: string;
}

export interface RecentTxOptions {
  limit?: number;
  /** Only transactions 0xTzKT marks as failed. */
  failedOnly?: boolean;
  provider?: Provider;
}

/** Newest transactions sent by `address`, one entry per hash, via 0xTzKT. */
export async function recentTransactionsOf(
  address: string,
  network: NetworkName,
  opts: RecentTxOptions = {},
): Promise<RecentTx[]> {
  const provider = opts.provider ?? new Provider();
  const limit = opts.limit ?? 10;
  const status = opts.failedOnly ? "&status=failed" : "";
  const url = `${NETWORKS[network].xtzktApi}/v1/operations/transaction?sender.hash=${address}${status}&sort=id.desc&limit=${limit * 2}`;
  const rows =
    await provider.getJson<
      { hash?: string; status?: string; level?: number; direction?: string }[]
    >(url);
  const seen = new Set<string>();
  const out: RecentTx[] = [];
  for (const r of rows) {
    if (!r.hash || seen.has(r.hash)) continue;
    seen.add(r.hash);
    out.push({
      hash: r.hash,
      status: r.status ?? "?",
      level: r.level ?? 0,
      direction: r.direction ?? "?",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function networkForChainId(chainId: number | string): NetworkName | undefined {
  const id = typeof chainId === "string" ? parseInt(chainId, 16) : chainId;
  for (const n of Object.values(NETWORKS)) if (n.evmChainId === id) return n.name;
  return undefined;
}

const EVM_RE = /0x[0-9a-fA-F]{64}/g;
const OP_RE = /\bo[1-9A-HJ-NP-Za-km-z]{50}\b/g;

/** Every tx / op hash mentioned in a blob of text (test output, logs), in order, deduped. */
export function extractHashes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(EVM_RE)) out.push(m[0].toLowerCase());
  for (const m of text.matchAll(OP_RE)) out.push(m[0]);
  return [...new Set(out)];
}

export interface BroadcastTx {
  hash: string;
  status?: string;
  contractName?: string;
  function?: string;
}

/**
 * Transactions of a Foundry broadcast file (`broadcast/<Script>.s.sol/<chainId>/run-latest.json`),
 * joined with their receipts. `failedOnly` keeps those whose receipt status is not 0x1.
 */
export function broadcastTransactions(broadcast: unknown, failedOnly = true): BroadcastTx[] {
  const b = (broadcast ?? {}) as {
    transactions?: {
      hash?: string | null;
      contractName?: string | null;
      function?: string | null;
    }[];
    receipts?: { transactionHash?: string; status?: string }[];
  };
  const statusByHash = new Map<string, string>();
  for (const r of b.receipts ?? []) {
    if (r.transactionHash && r.status) statusByHash.set(r.transactionHash.toLowerCase(), r.status);
  }
  const out: BroadcastTx[] = [];
  for (const t of b.transactions ?? []) {
    if (!t.hash) continue;
    const hash = t.hash.toLowerCase();
    const status = statusByHash.get(hash);
    if (failedOnly && status === "0x1") continue;
    const tx: BroadcastTx = { hash };
    if (status) tx.status = status;
    if (t.contractName) tx.contractName = t.contractName;
    if (t.function) tx.function = t.function;
    out.push(tx);
  }
  return out;
}

/** Absolute path of the nactrace CLI entry, resolved from this package's dependencies. */
export function resolveCli(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    return require.resolve("nactrace/dist/index.js");
  } catch {
    return undefined;
  }
}

export interface RunOptions {
  /** Path to the CLI entry; defaults to the workspace/npm resolution, then `nactrace` on PATH. */
  cli?: string;
  stdio?: "inherit" | "pipe";
}

/** Run the CLI once and return its exit code (0 ok, 1 reverted/caught, 2 error). */
export function runNactrace(
  args: string[],
  opts: RunOptions = {},
): { code: number; stdout?: string } {
  const cli = opts.cli ?? resolveCli();
  const stdio = opts.stdio ?? "inherit";
  const res = cli
    ? spawnSync(process.execPath, [cli, ...args], { stdio, encoding: "utf8" })
    : spawnSync("nactrace", args, { stdio, encoding: "utf8", shell: process.platform === "win32" });
  if (res.error) throw res.error;
  const out: { code: number; stdout?: string } = { code: res.status ?? 2 };
  if (stdio === "pipe") out.stdout = res.stdout ?? "";
  return out;
}

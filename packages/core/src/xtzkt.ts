// 0xTzKT adapter (PRIMARY data source, SPEC §3.2). Row types are generated from recorded
// responses by scripts/gen-xtzkt-types.mjs into xtzkt.types.ts; never hand-edit them.
// Unknown fields pass through untouched (index signature on every generated type).
import type { NetworkName } from "./networks.js";
import { NETWORKS } from "./networks.js";
import type { Provider } from "./provider.js";
import type { XtzktTransactionRow } from "./xtzkt.types.js";

export type { XtzktTransactionRow } from "./xtzkt.types.js";

/** Full `direction` enum from /v1/openapi.json (discriminator on TransactionOperation). */
export const XTZKT_DIRECTIONS = [
  "l1",
  "x_evm",
  "x_michelson",
  "x_evm_michelson",
  "x_michelson_evm",
] as const;
export type XtzktDirection = (typeof XTZKT_DIRECTIONS)[number];

export const CROSSING_DIRECTIONS: ReadonlySet<string> = new Set([
  "x_evm_michelson",
  "x_michelson_evm",
]);

export function isCrossingRow(row: XtzktTransactionRow): boolean {
  return typeof row.direction === "string" && CROSSING_DIRECTIONS.has(row.direction);
}

export function transactionRowsUrl(network: NetworkName, hash: string): string {
  return `${NETWORKS[network].xtzktApi}/v1/operations/transaction?hash=${encodeURIComponent(hash)}`;
}

/** One row per leg sharing `hash`; `[]` when 0xTzKT does not know the hash. */
export async function getTransactionRows(
  provider: Provider,
  network: NetworkName,
  hash: string,
): Promise<XtzktTransactionRow[]> {
  const body = await provider.getJson<unknown>(transactionRowsUrl(network, hash));
  if (!Array.isArray(body)) throw new Error(`0xTzKT ${network}: expected an array for ${hash}`);
  return body as XtzktTransactionRow[];
}

export interface DetectedNetwork {
  network: NetworkName;
  rows: XtzktTransactionRow[];
}

/** Ask each network's 0xTzKT in order until one returns rows (SPEC §5.1). */
export async function detectNetwork(
  provider: Provider,
  hash: string,
  candidates: readonly NetworkName[] = ["previewnet", "mainnet", "shadownet"],
): Promise<DetectedNetwork | undefined> {
  const results = await Promise.allSettled(
    candidates.map(async (network) => ({
      network,
      rows: await getTransactionRows(provider, network, hash),
    })),
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.rows.length > 0) return r.value;
  }
  return undefined;
}

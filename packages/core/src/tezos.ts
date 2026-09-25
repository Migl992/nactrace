// Tezos (Michelson interface) RPC adapter. Shapes from recorded Previewnet/mainnet blocks
// (fixtures/raw/<network>/tezos/*.json). Every type keeps an index signature.
import type { NetworkName } from "./networks.js";
import { NETWORKS } from "./networks.js";
import { ProviderError, type Provider } from "./provider.js";

export interface MichelineNode {
  prim?: string;
  args?: MichelineNode[];
  annots?: string[];
  int?: string;
  string?: string;
  bytes?: string;
  [key: string]: unknown;
}
export type Micheline = MichelineNode | MichelineNode[];

export interface TezosError {
  kind?: string;
  id?: string;
  error_message?: string;
  with?: Micheline;
  [key: string]: unknown;
}

export interface TezosOperationResult {
  status?: "applied" | "failed" | "backtracked" | "skipped" | string;
  errors?: TezosError[];
  consumed_milligas?: string;
  storage?: Micheline;
  storage_size?: string;
  paid_storage_size_diff?: string;
  originated_contracts?: string[];
  [key: string]: unknown;
}

export interface TezosInternalOperation {
  kind: string;
  source?: string;
  nonce?: number;
  destination?: string;
  amount?: string;
  parameters?: { entrypoint?: string; value?: Micheline; [key: string]: unknown };
  /** `event` internals */
  tag?: string;
  type?: Micheline;
  payload?: Micheline;
  result?: TezosOperationResult;
  [key: string]: unknown;
}

export interface TezosContent {
  kind: string;
  source?: string;
  destination?: string;
  fee?: string;
  counter?: string;
  gas_limit?: string;
  storage_limit?: string;
  amount?: string;
  parameters?: { entrypoint?: string; value?: Micheline; [key: string]: unknown };
  metadata?: {
    operation_result?: TezosOperationResult;
    internal_operation_results?: TezosInternalOperation[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TezosOperation {
  protocol?: string;
  chain_id?: string;
  hash: string;
  branch?: string;
  contents: TezosContent[];
  signature?: string;
  [key: string]: unknown;
}

export interface TezosBlockHeader {
  level: number;
  hash?: string;
  timestamp?: string;
  protocol?: string;
  chain_id?: string;
  predecessor?: string;
  [key: string]: unknown;
}

function base(network: NetworkName): string {
  return NETWORKS[network].michelsonRpc;
}

/** All operations of a block, grouped by validation pass (crossings live in the last one). */
export async function getBlockOperations(
  provider: Provider,
  network: NetworkName,
  level: number,
): Promise<TezosOperation[][]> {
  return provider.getJson<TezosOperation[][]>(
    `${base(network)}/chains/main/blocks/${level}/operations`,
  );
}

export async function getBlockHeader(
  provider: Provider,
  network: NetworkName,
  level: number,
): Promise<TezosBlockHeader> {
  return provider.getJson<TezosBlockHeader>(`${base(network)}/chains/main/blocks/${level}/header`);
}

/** Storage at a level, or undefined when the contract did not exist yet (node answers 404). */
export async function getStorage(
  provider: Provider,
  network: NetworkName,
  contract: string,
  level: number | "head",
): Promise<Micheline | undefined> {
  try {
    return await provider.getJson<Micheline>(
      `${base(network)}/chains/main/blocks/${level}/context/contracts/${contract}/storage`,
    );
  } catch (e) {
    if (e instanceof ProviderError && e.status === 404) return undefined;
    throw e;
  }
}

export function findOperation(
  passes: TezosOperation[][],
  opHash: string,
): TezosOperation | undefined {
  for (const pass of passes) for (const op of pass) if (op.hash === opHash) return op;
  return undefined;
}

/** Every KT1 a content (and its internals) touches: destinations, sources and originated contracts. */
export function touchedContracts(contents: TezosContent[]): string[] {
  const out = new Set<string>();
  const add = (a: unknown) => {
    if (typeof a === "string" && a.startsWith("KT1")) out.add(a);
  };
  for (const c of contents) {
    add(c.source);
    add(c.destination);
    for (const a of c.metadata?.operation_result?.originated_contracts ?? []) add(a);
    for (const i of c.metadata?.internal_operation_results ?? []) {
      add(i.source);
      add(i.destination);
      for (const a of i.result?.originated_contracts ?? []) add(a);
    }
  }
  return [...out];
}

/** First error found on the op, deepest internal first (that is where the real reason lives). */
export function firstError(op: TezosOperation): TezosError | undefined {
  for (const c of op.contents) {
    for (const i of c.metadata?.internal_operation_results ?? []) {
      const e = i.result?.errors?.[0];
      if (e) return e;
    }
    const e = c.metadata?.operation_result?.errors?.[0];
    if (e) return e;
  }
  return undefined;
}

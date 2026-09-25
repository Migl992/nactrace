// Trace JSON schema v1 (SPEC §6). Additive fields beyond the spec are marked.
import type { NetworkName } from "./networks.js";

export type Runtime = "evm" | "michelson";

export type NodeKind = "tx" | "op" | "call" | "view" | "crossing" | "callback" | "alias_created";
export type NodeStatus = "success" | "reverted" | "backtracked" | "skipped";
export type TraceStatus = "success" | "reverted" | "partially_caught";
export type AddressRole = "native" | "alias" | "gateway" | "system" | "unknown";

export interface Address {
  value: string;
  runtime: Runtime;
  role: AddressRole;
  /** Alias in the other runtime, if resolvable. */
  counterpart?: string | undefined;
  label?: string | undefined;
}

export interface Gas {
  used?: string | undefined;
  limit?: string | undefined;
  unit: "evm_gas" | "michelson_milligas";
}

export interface DecodedEvent {
  name: string;
  address?: string;
  args?: Record<string, unknown>;
  topics?: string[];
  data?: string;
}

export interface StorageDiff {
  before: unknown;
  after: unknown;
}

export interface TraceNode {
  /** Stable within a trace: n0, n1, … in depth-first creation order. */
  id: string;
  runtime: Runtime;
  kind: NodeKind;
  hash?: string | undefined;
  synthetic?: boolean | undefined;
  from: Address;
  to: Address;
  /** Michelson entrypoint, or EVM function signature / selector. */
  entrypoint?: string | undefined;
  /** "<amount> wei" or "<amount> mutez". */
  value?: string | undefined;
  gas?: Gas | undefined;
  /** Additive: Michelson milligas of the leg, when the primary `gas` is EVM gas. */
  michelsonGas?: Gas | undefined;
  status: NodeStatus;
  /** Decoded revert reason, e.g. "Cross-runtime call failed with status 400 Bad Request: …". */
  error?: string | undefined;
  /** Additive: raw Michelson error object for the leg (Tezos RPC `errors[0]`). */
  michelsonError?: unknown | undefined;
  /** Additive: decoded return data (views). */
  output?: string | undefined;
  storageDiff?: StorageDiff | undefined;
  events: DecodedEvent[];
  children: TraceNode[];
  links: { blockscout?: string; tzkt?: string };
  raw?: Record<string, unknown> | undefined;
}

export interface Explanation {
  summary: string;
  failedNodeId?: string;
  evmReason?: string;
  michelsonError?: unknown;
}

export interface TraceMeta {
  source: "xtzkt+rpc" | "rpc_only";
  xtzktSchemaObservedAt?: string;
  kernelVersionHint?: string;
  correlation: "xtzkt_hash" | "derived_hash";
  fetchedAt: string;
  sources: { url: string; method: string }[];
  /** Additive: non-fatal problems met while building (hash mismatch, trace unavailable, …). */
  warnings: string[];
}

export interface Trace {
  schemaVersion: "1";
  network: NetworkName;
  root: TraceNode;
  status: TraceStatus;
  /** True when a failure rolled back both sides entirely. */
  atomic: boolean;
  explanation: Explanation;
  meta: TraceMeta;
}

/** Depth-first walk, parents before children. */
export function* walkNodes(
  node: TraceNode,
  depth = 0,
  parent?: TraceNode,
): Generator<{ node: TraceNode; depth: number; parent?: TraceNode }> {
  yield parent ? { node, depth, parent } : { node, depth };
  for (const c of node.children) yield* walkNodes(c, depth + 1, node);
}

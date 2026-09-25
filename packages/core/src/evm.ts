// EVM JSON-RPC adapter. Shapes below were taken from recorded Previewnet/mainnet responses
// (fixtures/raw/<network>/evm/*.json); every type keeps an index signature so extra fields
// never break parsing. Only hex strings here; conversion helpers at the bottom.
import type { NetworkName } from "./networks.js";
import { NETWORKS } from "./networks.js";
import type { Provider, RpcError } from "./provider.js";

export type Hex = `0x${string}`;

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  logIndex?: string;
  [key: string]: unknown;
}

export interface EvmReceipt {
  transactionHash: string;
  blockNumber: string;
  blockHash?: string;
  from: string;
  to: string | null;
  status: string;
  gasUsed: string;
  cumulativeGasUsed?: string;
  effectiveGasPrice?: string;
  contractAddress?: string | null;
  logs: EvmLog[];
  [key: string]: unknown;
}

export interface EvmTransaction {
  hash: string;
  blockNumber: string | null;
  from: string;
  to: string | null;
  input: string;
  value: string;
  gas: string;
  gasPrice?: string;
  nonce: string;
  type?: string;
  [key: string]: unknown;
}

/** One frame of a `callTracer` trace. */
export interface CallFrame {
  type: string;
  from: string;
  to?: string;
  value?: string;
  gas?: string;
  gasUsed?: string;
  input?: string;
  output?: string;
  error?: string;
  revertReason?: string;
  logs?: EvmLog[];
  calls?: CallFrame[];
  [key: string]: unknown;
}

export interface TraceResult {
  frame?: CallFrame;
  /** Set when the node refused or failed the trace (e.g. mainnet public node: code -32053). */
  error?: RpcError;
}

function rpcUrl(network: NetworkName): string {
  return NETWORKS[network].evmRpc;
}

export async function getTransactionReceipt(
  provider: Provider,
  network: NetworkName,
  hash: string,
): Promise<EvmReceipt | null> {
  const res = await provider.rpc(rpcUrl(network), "eth_getTransactionReceipt", [hash]);
  if (res.error) throw new Error(`eth_getTransactionReceipt: ${res.error.message}`);
  return (res.result as EvmReceipt | null) ?? null;
}

export async function getTransaction(
  provider: Provider,
  network: NetworkName,
  hash: string,
): Promise<EvmTransaction | null> {
  const res = await provider.rpc(rpcUrl(network), "eth_getTransactionByHash", [hash]);
  if (res.error) throw new Error(`eth_getTransactionByHash: ${res.error.message}`);
  return (res.result as EvmTransaction | null) ?? null;
}

export async function traceTransaction(
  provider: Provider,
  network: NetworkName,
  hash: string,
): Promise<TraceResult> {
  const res = await provider.rpc(rpcUrl(network), "debug_traceTransaction", [
    hash,
    { tracer: "callTracer" },
  ]);
  if (res.error) return { error: res.error };
  return res.result ? { frame: res.result as CallFrame } : {};
}

export async function ethCall(
  provider: Provider,
  network: NetworkName,
  to: string,
  data: string,
): Promise<Hex> {
  const res = await provider.rpc(rpcUrl(network), "eth_call", [{ to, data }, "latest"]);
  if (res.error) throw new Error(`eth_call: ${res.error.message}`);
  return res.result as Hex;
}

export function hexToBigInt(hex: string | undefined | null): bigint | undefined {
  if (hex === undefined || hex === null || hex === "") return undefined;
  return BigInt(hex);
}

export function hexToNumber(hex: string | undefined | null): number | undefined {
  const b = hexToBigInt(hex);
  return b === undefined ? undefined : Number(b);
}

/** Walk a callTracer tree depth-first, parents before children. */
export function* walkFrames(
  frame: CallFrame,
  depth = 0,
): Generator<{ frame: CallFrame; depth: number }> {
  yield { frame, depth };
  for (const child of frame.calls ?? []) yield* walkFrames(child, depth + 1);
}

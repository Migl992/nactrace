// buildTrace(): SPEC §5.1. 0xTzKT rows give the skeleton (every leg of the crossing), EVM receipt +
// callTracer and Tezos block operations enrich it, derived hashes are cross-checked, explain() ends.
// Falls back to RPC only (§5.2) when 0xTzKT has nothing. Never throws on a missing enrichment:
// every problem lands in trace.meta.warnings.
import { decodeAbiParameters, decodeErrorResult, decodeEventLog, decodeFunctionData } from "viem";
import {
  EVM_GATEWAY_ADDRESS,
  gatewayEventsAbi,
  gatewayFunctionsAbi,
  CROSS_RUNTIME_CALL_RECEIVED_TOPIC0,
  CROSS_RUNTIME_CALL_SENT_TOPIC0,
} from "./events.js";
import {
  getTransaction,
  getTransactionReceipt,
  hexToBigInt,
  traceTransaction,
  walkFrames,
  type CallFrame,
  type EvmLog,
  type EvmReceipt,
} from "./evm.js";
import { explain } from "./explain.js";
import { syntheticEvmTxHash, syntheticMichelsonOpHash } from "./hashes.js";
import { parseInput } from "./input.js";
import { classifyAddress, isGatewayAddress, SYSTEM_ADDRESSES, type AddressHint } from "./labels.js";
import { summarizeTezosError } from "./michelson-errors.js";
import { NETWORKS, type NetworkName } from "./networks.js";
import type { Provider, ProviderRequest } from "./provider.js";
import {
  findOperation,
  getBlockOperations,
  getStorage,
  type MichelineNode,
  type TezosContent,
  type TezosInternalOperation,
  type TezosOperation,
} from "./tezos.js";
import {
  walkNodes,
  type Address,
  type DecodedEvent,
  type NodeStatus,
  type Runtime,
  type Trace,
  type TraceNode,
  type TraceStatus,
} from "./types.js";
import { detectNetwork, getTransactionRows, type XtzktTransactionRow } from "./xtzkt.js";
import type { XtzktAccountRef } from "./xtzkt.types.js";

export interface BuildTraceOptions {
  provider: Provider;
  /** Skip auto-detection. Required for RPC-only mode when the input is not an explorer URL. */
  network?: NetworkName;
  /** false: do not ask 0xTzKT at all (forces the RPC-only path). Default true. */
  useXtzkt?: boolean;
  /** false: skeleton only, no RPC enrichment. Default true. */
  enrich?: boolean;
  /** Block level of the operation, for the RPC-only path when nothing else reveals it. */
  level?: number;
}

interface Ctx {
  provider: Provider;
  network: NetworkName;
  origin: Runtime;
  evmHash: string;
  opHash: string;
  warnings: string[];
  nextId: number;
}

// ---------------------------------------------------------------------------------------------
// small helpers

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return typeof v === "string"
    ? v
    : typeof v === "number" || typeof v === "bigint"
      ? String(v)
      : undefined;
}

function nonZero(v: string | undefined): string | undefined {
  return v && v !== "0" ? v : undefined;
}

function wei(v: unknown): string | undefined {
  const s = nonZero(str(v));
  return s ? `${s} wei` : undefined;
}

function mutez(v: unknown): string | undefined {
  const s = nonZero(str(v));
  return s ? `${s} mutez` : undefined;
}

function selectorOf(input: unknown): string | undefined {
  return typeof input === "string" && input.length >= 10 ? input.slice(0, 10) : undefined;
}

function hexToDecimal(hex: string | undefined): string | undefined {
  const b = hexToBigInt(hex);
  return b === undefined ? undefined : b.toString();
}

function rowStatus(ctx: Ctx, r: XtzktTransactionRow): NodeStatus {
  switch (r.status) {
    case "applied":
    case undefined:
      return "success";
    case "failed":
      return "reverted";
    case "backtracked":
    case "skipped":
      return r.status;
    default:
      ctx.warnings.push(`unknown 0xTzKT status "${String(r.status)}" on row ${String(r.id)}`);
      return "success";
  }
}

function rowError(r: XtzktTransactionRow): string | undefined {
  if (r.errors === undefined || r.errors === null) return undefined;
  return typeof r.errors === "string" ? r.errors : JSON.stringify(r.errors);
}

function addr(
  ref: XtzktAccountRef | undefined,
  fallbackRuntime: Runtime,
  counterpart?: string,
): Address {
  if (!ref?.hash) return { value: "?", runtime: fallbackRuntime, role: "unknown" };
  return classifyAddress(ref.hash, { type: ref.type, counterpart });
}

/** "http://tezos/KT1abc/transfer" -> { destination, entrypoint }; "http://ethereum/0x…" likewise. */
function parseGatewayUrl(url: unknown): {
  destination?: string | undefined;
  entrypoint?: string | undefined;
} {
  if (typeof url !== "string") return {};
  const m = /^https?:\/\/(?:tezos|ethereum)\/([^/?#]+)(?:\/([^/?#]+))?/.exec(url);
  if (!m) return {};
  return m[2] ? { destination: m[1], entrypoint: m[2] } : { destination: m[1] };
}

function gp(r: XtzktTransactionRow): Record<string, unknown> {
  return (r.gatewayParameters ?? {}) as Record<string, unknown>;
}

function links(ctx: Ctx, evmHash?: string, opHash?: string): TraceNode["links"] {
  const cfg = NETWORKS[ctx.network];
  const out: TraceNode["links"] = {};
  if (evmHash) out.blockscout = `${cfg.blockscout}/tx/${evmHash}`;
  if (opHash) out.tzkt = `${cfg.tzkt}/${opHash}`;
  return out;
}

function newNode(
  ctx: Ctx,
  n: Omit<TraceNode, "id" | "events" | "children" | "links"> &
    Partial<Pick<TraceNode, "events" | "children" | "links">>,
): TraceNode {
  const node: TraceNode = {
    id: `n${ctx.nextId++}`,
    ...n,
    events: n.events ?? [],
    children: n.children ?? [],
    links: n.links ?? {},
  };
  // Drop undefined optionals so JSON snapshots stay clean.
  for (const k of Object.keys(node) as (keyof TraceNode)[])
    if (node[k] === undefined) delete node[k];
  return node;
}

// ---------------------------------------------------------------------------------------------
// skeleton from 0xTzKT rows

function txNodeFromEvmRow(ctx: Ctx, r: XtzktTransactionRow): TraceNode {
  return newNode(ctx, {
    runtime: "evm",
    kind: "tx",
    hash: ctx.evmHash,
    from: addr(r.sender, "evm"),
    to: addr(r.target, "evm"),
    entrypoint: r.entrypoint ?? selectorOf(r.input),
    value: wei(r.amount),
    gas: { used: str(r.gasUsed), limit: str(r.gasLimit), unit: "evm_gas" },
    status: rowStatus(ctx, r),
    error: rowError(r),
    links: links(ctx, ctx.evmHash, ctx.opHash),
    raw: { xtzkt: r },
  });
}

/** EOA called the gateway precompile directly: a single x_evm_michelson row with opType dynamic_fee. */
function txNodeFromDirectGatewayRow(ctx: Ctx, r: XtzktTransactionRow): TraceNode {
  return newNode(ctx, {
    runtime: "evm",
    kind: "tx",
    hash: ctx.evmHash,
    from: addr(r.sender, "evm", r.alias?.hash),
    to: addr(r.gateway, "evm"),
    entrypoint: r.gatewayEntrypoint,
    value: wei(r.amountSent),
    gas: { used: str(r.gasUsed), limit: str(r.gasLimit), unit: "evm_gas" },
    status: rowStatus(ctx, r),
    error: rowError(r),
    links: links(ctx, ctx.evmHash, ctx.opHash),
    raw: { xtzkt: r },
  });
}

function opNodeFromMichelsonRow(ctx: Ctx, r: XtzktTransactionRow): TraceNode {
  return newNode(ctx, {
    runtime: "michelson",
    kind: "op",
    hash: ctx.opHash,
    from: addr(r.sender, "michelson"),
    to: addr(r.target, "michelson"),
    entrypoint: r.entrypoint,
    value: mutez(r.amount),
    status: rowStatus(ctx, r),
    error: rowError(r),
    links: links(ctx, ctx.evmHash, ctx.opHash),
    raw: { xtzkt: r },
  });
}

/** tz1 called the Michelson gateway directly: first row is x_michelson_evm. */
function opNodeFromDirectGatewayRow(ctx: Ctx, r: XtzktTransactionRow): TraceNode {
  return newNode(ctx, {
    runtime: "michelson",
    kind: "op",
    hash: ctx.opHash,
    from: addr(r.sender, "michelson", r.alias?.hash),
    to: addr(r.gateway, "michelson"),
    entrypoint: r.gatewayEntrypoint,
    value: mutez(r.amountSent),
    status: rowStatus(ctx, r),
    error: rowError(r),
    links: links(ctx, ctx.evmHash, ctx.opHash),
    raw: { xtzkt: r },
  });
}

function crossingEvmToMichelson(ctx: Ctx, r: XtzktTransactionRow): TraceNode {
  const p = gp(r);
  const fromUrl = parseGatewayUrl(p["url"]);
  const to = r.target?.hash
    ? addr(r.target, "michelson")
    : classifyAddress(str(p["destination"]) ?? fromUrl.destination ?? "?");
  return newNode(ctx, {
    runtime: "michelson",
    kind: "crossing",
    hash: ctx.opHash,
    synthetic: ctx.origin === "evm",
    from: addr(r.sender, "evm", r.alias?.hash),
    to,
    entrypoint: r.entrypoint ?? str(p["entrypoint"]) ?? fromUrl.entrypoint ?? "default",
    value: wei(r.amountSent),
    gas: { used: str(r.gasUsed), unit: "evm_gas" },
    status: rowStatus(ctx, r),
    error: rowError(r),
    links: links(ctx, undefined, ctx.opHash),
    raw: { xtzkt: r },
  });
}

function crossingMichelsonToEvm(ctx: Ctx, r: XtzktTransactionRow): TraceNode {
  const p = gp(r);
  const fromUrl = parseGatewayUrl(p["string"]);
  const to = r.target?.hash
    ? addr(r.target, "evm")
    : classifyAddress(str(p["string_0"]) ?? fromUrl.destination ?? "?");
  const signature = nonZero(str(p["string_1"]) ?? "") || undefined;
  return newNode(ctx, {
    runtime: "evm",
    kind: "crossing",
    hash: ctx.evmHash,
    synthetic: ctx.origin === "michelson",
    from: addr(r.sender, "michelson", r.alias?.hash),
    to,
    entrypoint: r.entrypoint ?? signature ?? fromUrl.entrypoint,
    value: mutez(r.amountSent),
    status: rowStatus(ctx, r),
    error: rowError(r),
    links: links(ctx, ctx.evmHash),
    raw: { xtzkt: r },
  });
}

function evmInternalNode(ctx: Ctx, r: XtzktTransactionRow): TraceNode {
  const params = (r.parameters ?? {}) as Record<string, unknown>;
  const isView =
    r.opCode === "static_call" &&
    typeof r.entrypoint === "string" &&
    r.entrypoint.startsWith("callMichelsonView(") &&
    isGatewayAddress(r.target?.hash ?? "");
  if (isView) {
    return newNode(ctx, {
      runtime: "michelson",
      kind: "view",
      from: addr(r.sender, "evm"),
      to: classifyAddress(str(params["destination"]) ?? "?"),
      entrypoint: str(params["viewName"]),
      gas: { used: str(r.gasUsed), unit: "evm_gas" },
      status: rowStatus(ctx, r),
      error: rowError(r),
      output: r.status === "applied" ? decodeViewOutput(str(r.output)) : undefined,
      raw: { xtzkt: r },
    });
  }
  return newNode(ctx, {
    runtime: "evm",
    kind: "call",
    from: addr(r.sender, "evm"),
    to: addr(r.target, "evm"),
    entrypoint: r.entrypoint ?? selectorOf(r.input),
    value: wei(r.amount),
    gas: { used: str(r.gasUsed), unit: "evm_gas" },
    status: rowStatus(ctx, r),
    error: rowError(r),
    output: str(r.output),
    raw: { xtzkt: r },
  });
}

function michelsonInternalNode(ctx: Ctx, r: XtzktTransactionRow): TraceNode {
  return newNode(ctx, {
    runtime: "michelson",
    kind: "call",
    from: addr(r.sender, "michelson"),
    to: addr(r.target, "michelson"),
    entrypoint: r.entrypoint,
    value: mutez(r.amount),
    status: rowStatus(ctx, r),
    error: rowError(r),
    raw: { xtzkt: r },
  });
}

function skeletonFromRows(ctx: Ctx, rowsIn: XtzktTransactionRow[]): TraceNode {
  const rows = [...rowsIn].sort((a, b) => {
    const x = BigInt(str(a.id) ?? "0");
    const y = BigInt(str(b.id) ?? "0");
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const first = rows[0]!;
  let root: TraceNode;
  let i = 0;
  let currentEvm: TraceNode | undefined;
  let currentMich: TraceNode | undefined;

  if (ctx.origin === "evm") {
    if (first.direction === "x_evm") {
      root = txNodeFromEvmRow(ctx, first);
      i = 1;
    } else {
      root = txNodeFromDirectGatewayRow(ctx, first);
      if (first.direction !== "x_evm_michelson") {
        ctx.warnings.push(
          `unexpected first row direction ${String(first.direction)} for an EVM hash`,
        );
      }
    }
    currentEvm = root;
  } else {
    if (first.direction === "x_michelson") {
      root = opNodeFromMichelsonRow(ctx, first);
      i = 1;
    } else {
      root = opNodeFromDirectGatewayRow(ctx, first);
      if (first.direction !== "x_michelson_evm") {
        ctx.warnings.push(
          `unexpected first row direction ${String(first.direction)} for an op hash`,
        );
      }
    }
    currentMich = root;
  }

  for (; i < rows.length; i++) {
    const r = rows[i]!;
    switch (r.direction) {
      case "x_evm_michelson": {
        const n = crossingEvmToMichelson(ctx, r);
        (currentEvm ?? root).children.push(n);
        currentMich = n;
        break;
      }
      case "x_michelson_evm": {
        const n = crossingMichelsonToEvm(ctx, r);
        (currentMich ?? root).children.push(n);
        currentEvm = n;
        break;
      }
      case "x_evm":
        (currentEvm ?? root).children.push(evmInternalNode(ctx, r));
        break;
      case "x_michelson":
        if (isGatewayAddress(r.sender?.hash ?? "")) {
          // Return value of a %call_evm delivered by TRANSFER_TOKENS from the Michelson gateway.
          const n = michelsonInternalNode(ctx, r);
          n.kind = "callback";
          (currentEvm ?? root).children.push(n);
        } else {
          (currentMich ?? root).children.push(michelsonInternalNode(ctx, r));
        }
        break;
      default:
        ctx.warnings.push(`ignored 0xTzKT row with direction ${String(r.direction)}`);
    }
  }
  return root;
}

// ---------------------------------------------------------------------------------------------
// EVM enrichment

function decodeViewOutput(output: string | undefined): string | undefined {
  if (!output || output === "0x") return output;
  try {
    const [bytes] = decodeAbiParameters([{ type: "bytes" }], output as `0x${string}`);
    return bytes;
  } catch {
    return output;
  }
}

function decodeRevert(output: string | undefined): string | undefined {
  if (!output || output === "0x") return undefined;
  try {
    const d = decodeErrorResult({ abi: [], data: output as `0x${string}` });
    if (d.errorName === "Error" && d.args?.[0] !== undefined) return String(d.args[0]);
    if (d.errorName === "Panic") return `Panic(${String(d.args?.[0])})`;
    return d.errorName;
  } catch {
    // Custom error: we have no ABI, so name it by selector and keep the payload visible.
    if (/^0x[0-9a-fA-F]{8}/.test(output)) {
      const rest = output.length > 10 ? ` ${output.slice(10)}` : "";
      return `custom error ${output.slice(0, 10)}${rest}`;
    }
    return undefined;
  }
}

function decodeLog(log: EvmLog): DecodedEvent {
  const topic0 = log.topics[0];
  if (topic0 === CROSS_RUNTIME_CALL_SENT_TOPIC0 || topic0 === CROSS_RUNTIME_CALL_RECEIVED_TOPIC0) {
    try {
      const d = decodeEventLog({
        abi: gatewayEventsAbi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d.args as Record<string, unknown>)) {
        args[k] = typeof v === "bigint" ? v.toString() : v;
      }
      return { name: d.eventName, address: log.address, args, topics: log.topics, data: log.data };
    } catch {
      /* fall through */
    }
  }
  return { name: topic0 ?? "log", address: log.address, topics: log.topics, data: log.data };
}

function crossingsInto(
  root: TraceNode,
  runtime: Runtime,
  kind: "crossing" | "view" = "crossing",
): TraceNode[] {
  return [...walkNodes(root)]
    .map((x) => x.node)
    .filter((n) => n.kind === kind && n.runtime === runtime);
}

function applyReceipt(ctx: Ctx, root: TraceNode, receipt: EvmReceipt): void {
  const evmRoot = ctx.origin === "evm" ? root : crossingsInto(root, "evm")[0];
  if (ctx.origin === "evm") {
    const status: NodeStatus = receipt.status === "0x1" ? "success" : "reverted";
    if (root.status !== status) {
      ctx.warnings.push(
        `receipt status ${receipt.status} disagrees with 0xTzKT (${root.status}); trusting the receipt`,
      );
      root.status = status;
    }
    root.gas = {
      ...(root.gas ?? { unit: "evm_gas" }),
      used: hexToDecimal(receipt.gasUsed) ?? root.gas?.used,
    };
  }
  const sent = crossingsInto(root, "michelson");
  const received = crossingsInto(root, "evm");
  let iSent = 0;
  let iRecv = 0;
  for (const log of receipt.logs) {
    const ev = decodeLog(log);
    let target: TraceNode | undefined;
    if (ev.name === "CrossRuntimeCallSent") target = sent[iSent++];
    else if (ev.name === "CrossRuntimeCallReceived") target = received[iRecv++];
    (target ?? evmRoot ?? root).events.push(ev);
  }
  (evmRoot ?? root).raw = { ...(evmRoot ?? root).raw, receipt };
}

function applyCallTrace(ctx: Ctx, root: TraceNode, frame: CallFrame): void {
  const gatewayCalls: { frame: CallFrame; parent?: CallFrame }[] = [];
  const gatewayStatic: { frame: CallFrame; parent?: CallFrame }[] = [];
  const stack: { frame: CallFrame; depth: number }[] = [];
  for (const { frame: f, depth } of walkFrames(frame)) {
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const parent = stack[stack.length - 1]?.frame;
    stack.push({ frame: f, depth });
    if ((f.to ?? "").toLowerCase() !== EVM_GATEWAY_ADDRESS) continue;
    const entry = parent ? { frame: f, parent } : { frame: f };
    if (f.type === "STATICCALL") gatewayStatic.push(entry);
    else gatewayCalls.push(entry);
  }

  const pair = (
    nodes: TraceNode[],
    frames: { frame: CallFrame; parent?: CallFrame }[],
    what: string,
  ) => {
    // Extra gateway frames that errored never crossed (rejected by the gateway itself, e.g. a
    // malformed destination): 0xTzKT rightly has no leg for them, so that is not a mismatch.
    const rejectedOnly =
      frames.length > nodes.length && frames.slice(nodes.length).every((h) => h.frame.error);
    if (nodes.length !== frames.length && !rejectedOnly) {
      ctx.warnings.push(
        `${what}: 0xTzKT shows ${nodes.length} leg(s) but callTracer has ${frames.length} gateway frame(s)`,
      );
    }
    nodes.forEach((node, i) => {
      const hit = frames[i];
      if (!hit) return;
      const f = hit.frame;
      node.gas = {
        ...(node.gas ?? { unit: "evm_gas" }),
        used: hexToDecimal(f.gasUsed) ?? node.gas?.used,
      };
      if (f.error) {
        node.status = "reverted";
        node.error ??= f.revertReason ?? decodeRevert(f.output) ?? f.error;
        if (hit.parent && !hit.parent.error) node.raw = { ...node.raw, caughtByCaller: true };
      } else if (node.kind === "view" && f.output) {
        node.output = decodeViewOutput(f.output);
      }
      node.raw = { ...node.raw, callFrame: f };
    });
  };
  pair(crossingsInto(root, "michelson"), gatewayCalls, "EVM→Michelson crossings");
  pair(crossingsInto(root, "michelson", "view"), gatewayStatic, "Michelson views");

  if (ctx.origin === "evm" && frame.error) {
    root.status = "reverted";
    root.error ??= frame.revertReason ?? decodeRevert(frame.output) ?? frame.error;
  }
}

/** RPC-only skeleton of the EVM side: root from receipt/tx, one crossing or view per gateway frame. */
function skeletonFromEvmRpc(
  ctx: Ctx,
  receipt: EvmReceipt,
  tx: { from: string; to: string | null; input: string; value: string; gas: string } | null,
  frame: CallFrame | undefined,
): TraceNode {
  const created = !tx?.to && !receipt.to && typeof receipt.contractAddress === "string";
  let to = tx?.to ?? receipt.to ?? (created ? String(receipt.contractAddress) : "?");
  let input = tx?.input;
  let value = tx?.value;
  let fromHint: AddressHint = SYSTEM_ADDRESSES.has(receipt.from) ? {} : { type: "x_evm_user" };
  if (ctx.origin === "michelson") {
    // Synthetic tx: from == to == the tz1's alias. The real call is the frame alias -> target,
    // after the attribution frame 0x7e2058…01 -> alias (docs/FINDINGS.md, EVM RPC).
    fromHint = { type: "x_evm_alias" };
    const alias = receipt.from.toLowerCase();
    const target = frame?.calls?.find(
      (f) => (f.from ?? "").toLowerCase() === alias && (f.to ?? "").toLowerCase() !== alias,
    );
    if (target) {
      to = target.to ?? to;
      input = target.input;
      value = target.value;
    }
  }
  const root = newNode(ctx, {
    runtime: "evm",
    kind: "tx",
    hash: ctx.evmHash,
    synthetic: ctx.origin === "michelson",
    from: classifyAddress(receipt.from, fromHint),
    to: classifyAddress(to, isGatewayAddress(to) ? {} : { type: "x_evm_contract" }),
    entrypoint: created ? undefined : selectorOf(input),
    value: wei(hexToDecimal(value)),
    gas: { used: hexToDecimal(receipt.gasUsed), limit: hexToDecimal(tx?.gas), unit: "evm_gas" },
    status: receipt.status === "0x1" ? "success" : "reverted",
    error:
      receipt.status === "0x1" || !frame?.error
        ? undefined
        : (frame.revertReason ?? decodeRevert(frame.output) ?? frame.error),
    links: links(ctx, ctx.evmHash, ctx.opHash),
    raw: created ? { receipt, created: true } : { receipt },
  });
  if (frame) {
    const stack: { frame: CallFrame; depth: number }[] = [];
    for (const { frame: f, depth } of walkFrames(frame)) {
      while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
      const parent = stack[stack.length - 1]?.frame;
      stack.push({ frame: f, depth });
      if ((f.to ?? "").toLowerCase() !== EVM_GATEWAY_ADDRESS) continue;
      const n = nodeFromGatewayFrame(ctx, f);
      // Gateway frame errored but its caller did not: the revert was caught.
      if (f.error && parent && !parent.error) n.raw = { ...n.raw, caughtByCaller: true };
      root.children.push(n);
    }
  } else {
    // No trace (mainnet public node): CrossRuntimeCallSent logs still tell us every outgoing crossing.
    for (const log of receipt.logs) {
      const ev = decodeLog(log);
      if (ev.name !== "CrossRuntimeCallSent" || !ev.args) continue;
      const targetAddress = String(ev.args["targetAddress"] ?? "?");
      const [destination, entrypoint] = targetAddress.split("/");
      root.children.push(
        newNode(ctx, {
          runtime: "michelson",
          kind: "crossing",
          hash: ctx.opHash,
          synthetic: true,
          from: classifyAddress(log.address === EVM_GATEWAY_ADDRESS ? receipt.from : log.address),
          to: classifyAddress(destination ?? "?"),
          entrypoint: entrypoint ?? "default",
          value: wei(str(ev.args["amount"])),
          status: root.status,
          events: [ev],
          links: links(ctx, undefined, ctx.opHash),
        }),
      );
    }
  }
  return root;
}

function nodeFromGatewayFrame(ctx: Ctx, f: CallFrame): TraceNode {
  let entrypoint: string | undefined;
  let destination = "?";
  let fn = "";
  try {
    const d = decodeFunctionData({
      abi: gatewayFunctionsAbi,
      data: (f.input ?? "0x") as `0x${string}`,
    });
    fn = d.functionName;
    const a = d.args as readonly unknown[];
    if (fn === "callMichelson" || fn === "callMichelsonView") {
      destination = String(a[0]);
      entrypoint = String(a[1]);
    } else if (fn === "call") {
      const u = parseGatewayUrl(a[0]);
      destination = u.destination ?? "?";
      entrypoint = u.entrypoint ?? "default";
    }
  } catch {
    ctx.warnings.push(`could not decode gateway frame input ${selectorOf(f.input) ?? "?"}`);
  }
  const isView = f.type === "STATICCALL" || fn === "callMichelsonView";
  const status: NodeStatus = f.error ? "reverted" : "success";
  return newNode(ctx, {
    runtime: "michelson",
    kind: isView ? "view" : "crossing",
    hash: isView ? undefined : ctx.opHash,
    synthetic: isView ? undefined : ctx.origin === "evm",
    from: classifyAddress(f.from, { type: "x_evm_contract" }),
    to: classifyAddress(destination),
    entrypoint,
    value: wei(hexToDecimal(f.value)),
    gas: { used: hexToDecimal(f.gasUsed), unit: "evm_gas" },
    status,
    error: f.error ? (f.revertReason ?? decodeRevert(f.output) ?? f.error) : undefined,
    output: isView && !f.error ? decodeViewOutput(f.output) : undefined,
    links: isView ? {} : links(ctx, undefined, ctx.opHash),
    raw: { callFrame: f },
  });
}

// ---------------------------------------------------------------------------------------------
// Michelson enrichment

function internalStatus(s: string | undefined): NodeStatus {
  switch (s) {
    case "failed":
      return "reverted";
    case "backtracked":
    case "skipped":
      return s;
    default:
      return "success";
  }
}

async function applyTezosOperation(
  ctx: Ctx,
  root: TraceNode,
  op: TezosOperation,
  level: number,
): Promise<void> {
  const content: TezosContent | undefined = op.contents[0];
  if (!content) return;
  const result = content.metadata?.operation_result;
  const internals = content.metadata?.internal_operation_results ?? [];

  if (ctx.origin === "michelson") {
    root.gas = {
      used: result?.consumed_milligas,
      limit: content.gas_limit,
      unit: "michelson_milligas",
    };
    const st = internalStatus(result?.status);
    if (st !== "success" && root.status === "success") root.status = st;
    const err = result?.errors?.[0];
    if (err) {
      root.michelsonError = err;
      root.error ??= summarizeTezosError(err);
    }
  }

  // Internal transactions (excluding calls into the Michelson gateway) line up with the
  // EVM→Michelson crossing nodes in execution order.
  const isTx = (i: TezosInternalOperation) => i.kind === "transaction";
  const calls = internals.filter(
    (i) => isTx(i) && !isGatewayAddress(i.destination ?? "") && !isGatewayAddress(i.source ?? ""),
  );
  // Callback deliveries: TRANSFER_TOKENS emitted by the Michelson gateway after a %call_evm.
  const callbacks = internals.filter((i) => isTx(i) && isGatewayAddress(i.source ?? ""));
  const callbackNodes = [...walkNodes(root)]
    .map((x) => x.node)
    .filter((n) => n.kind === "callback");
  callbackNodes.forEach((node, i) => {
    const c = callbacks[i];
    if (!c) return;
    if (c.result?.consumed_milligas) {
      node.michelsonGas = { used: c.result.consumed_milligas, unit: "michelson_milligas" };
    }
    node.raw = { ...node.raw, tezosInternalOperation: c };
  });
  const nodes = crossingsInto(root, "michelson");
  if (calls.length !== nodes.length) {
    ctx.warnings.push(
      `Tezos op has ${calls.length} internal transaction(s) but the trace has ${nodes.length} Michelson leg(s)`,
    );
  }
  nodes.forEach((node, i) => {
    const call = calls[i];
    if (!call) return;
    if (call.result?.consumed_milligas) {
      node.michelsonGas = { used: call.result.consumed_milligas, unit: "michelson_milligas" };
    }
    const st = internalStatus(call.result?.status);
    if (st !== "success")
      node.status = st === "reverted" ? "reverted" : node.status === "reverted" ? "reverted" : st;
    const err = call.result?.errors?.[0];
    if (err) {
      node.michelsonError = err;
      node.error ??= summarizeTezosError(err);
    }
    node.raw = { ...node.raw, tezosInternalOperation: call };
  });

  for (const i of internals) {
    if (i.kind === "event") {
      root.events.push({
        name: str(i.tag) ?? "event",
        args: { payload: i.payload, source: i.source },
      });
    } else if (i.kind === "origination") {
      for (const kt1 of i.result?.originated_contracts ?? []) {
        root.children.unshift(
          newNode(ctx, {
            runtime: "michelson",
            kind: "alias_created",
            from: classifyAddress(i.source ?? "?"),
            to: classifyAddress(kt1, { type: "x_michelson_alias" }),
            michelsonGas: { used: i.result?.consumed_milligas, unit: "michelson_milligas" },
            status: internalStatus(i.result?.status),
            raw: { tezosInternalOperation: i },
          }),
        );
      }
    }
  }
  root.raw = { ...root.raw, tezosOperation: op };

  // Storage before/after for every Michelson contract a crossing targets (best effort).
  const seen = new Map<string, Promise<{ before: unknown; after: unknown }>>();
  for (const node of nodes) {
    const kt1 = node.to.value;
    if (!kt1.startsWith("KT1") || node.status === "skipped") continue;
    let p = seen.get(kt1);
    if (!p) {
      p = (async () => ({
        before: (await getStorage(ctx.provider, ctx.network, kt1, level - 1)) ?? null,
        after: (await getStorage(ctx.provider, ctx.network, kt1, level)) ?? null,
      }))();
      seen.set(kt1, p);
    }
    try {
      node.storageDiff = await p;
    } catch (e) {
      ctx.warnings.push(`storage of ${kt1}: ${(e as Error).message}`);
    }
  }
}

/** Does the op (top level or internally) call the Michelson gateway? */
function opCallsGateway(op: TezosOperation): boolean {
  return op.contents.some(
    (c) =>
      isGatewayAddress(c.destination ?? "") ||
      (c.metadata?.internal_operation_results ?? []).some((i) =>
        isGatewayAddress(i.destination ?? ""),
      ),
  );
}

/** `%call_evm` parameter: pair string (pair string (pair bytes (option (contract bytes)))). */
function parseCallEvmParams(value: unknown): { destination?: string; signature?: string } {
  const v = value as MichelineNode | undefined;
  const dest = v?.args?.[0]?.string;
  const sig = v?.args?.[1]?.args?.[0]?.string;
  const out: { destination?: string; signature?: string } = {};
  if (dest) out.destination = dest;
  if (sig) out.signature = sig;
  return out;
}

/** RPC-only root for a Michelson-originated op, from the Tezos operation itself. */
function opNodeFromTezosOperation(ctx: Ctx, op: TezosOperation): TraceNode {
  const c = op.contents[0]!;
  const to = c.destination ?? "?";
  return newNode(ctx, {
    runtime: "michelson",
    kind: "op",
    hash: ctx.opHash,
    from: classifyAddress(c.source ?? "?", { type: "x_michelson_user" }),
    to: classifyAddress(to, isGatewayAddress(to) ? {} : { type: "x_michelson_contract" }),
    entrypoint: c.parameters?.entrypoint,
    value: mutez(c.amount),
    status: internalStatus(c.metadata?.operation_result?.status),
    links: links(ctx, ctx.evmHash, ctx.opHash),
  });
}

// ---------------------------------------------------------------------------------------------

function overallStatus(root: TraceNode): { status: TraceStatus; atomic: boolean } {
  if (root.status === "reverted") return { status: "reverted", atomic: true };
  const anyFailed = [...walkNodes(root)].some(
    (x) => x.node !== root && x.node.status === "reverted",
  );
  return anyFailed
    ? { status: "partially_caught", atomic: false }
    : { status: "success", atomic: false };
}

function sourcesOf(reqs: ProviderRequest[]): { url: string; method: string }[] {
  return reqs.map((r) => ({ url: r.url, method: r.kind === "rpc" ? r.method : "GET" }));
}

export async function buildTrace(input: string, opts: BuildTraceOptions): Promise<Trace> {
  const { provider } = opts;
  const useXtzkt = opts.useXtzkt ?? true;
  const enrich = opts.enrich ?? true;
  const parsed = parseInput(input);
  const sourcesStart = provider.sources.length;
  const warnings: string[] = [];

  let network: NetworkName | undefined = opts.network ?? parsed.networkHint;
  let rows: XtzktTransactionRow[] = [];
  if (useXtzkt) {
    try {
      if (network) rows = await getTransactionRows(provider, network, parsed.hash);
      else {
        const d = await detectNetwork(provider, parsed.hash);
        if (d) ({ network, rows } = d);
      }
    } catch (e) {
      warnings.push(`0xTzKT unavailable: ${(e as Error).message}`);
    }
  }
  if (!network) {
    throw new Error(
      `0xTzKT does not know ${parsed.hash} on previewnet, mainnet or shadownet; pass --network for the RPC-only fallback`,
    );
  }

  const origin: Runtime = parsed.kind;
  const evmHash = origin === "evm" ? parsed.hash : syntheticEvmTxHash(parsed.hash);
  const opHash = origin === "evm" ? syntheticMichelsonOpHash(parsed.hash) : parsed.hash;
  const ctx: Ctx = { provider, network, origin, evmHash, opHash, warnings, nextId: 0 };
  const fromXtzkt = rows.length > 0;

  let root: TraceNode | undefined = fromXtzkt ? skeletonFromRows(ctx, rows) : undefined;
  let level: number | undefined = rows[0]?.level ?? opts.level;

  if (enrich || !fromXtzkt) {
    // EVM side
    let receipt: EvmReceipt | null = null;
    let frame: CallFrame | undefined;
    // A Michelson op that 0xTzKT shows without any EVM leg has no synthetic tx to fetch.
    const needsEvm =
      !fromXtzkt || origin === "evm" || rows.some((r) => r.direction === "x_michelson_evm");
    if (needsEvm) {
      try {
        receipt = await getTransactionReceipt(provider, network, evmHash);
      } catch (e) {
        warnings.push(`eth_getTransactionReceipt: ${(e as Error).message}`);
      }
    }
    if (receipt) {
      const t = await traceTransaction(provider, network, evmHash);
      if (t.error)
        warnings.push(`debug_traceTransaction unavailable on ${network}: ${t.error.message}`);
      frame = t.frame;
      level ??= Number(hexToBigInt(receipt.blockNumber));
    }

    // Michelson side: the block at `level` holds the (real or mirrored) operation.
    let op: TezosOperation | undefined;
    if (level !== undefined) {
      try {
        op = findOperation(await getBlockOperations(provider, network, level), opHash);
      } catch (e) {
        warnings.push(`Tezos block ${level}: ${(e as Error).message}`);
      }
    }

    if (!root) {
      // RPC-only skeleton (SPEC §5.2)
      if (origin === "evm") {
        if (!receipt)
          throw new Error(`${evmHash} is unknown to 0xTzKT and to the ${network} EVM node`);
        const tx = await getTransaction(provider, network, evmHash);
        root = skeletonFromEvmRpc(ctx, receipt, tx, frame);
      } else {
        if (!op)
          throw new Error(
            `operation ${opHash} not found on ${network} (0xTzKT has no rows and no level is known)`,
          );
        root = opNodeFromTezosOperation(ctx, op);
        if (receipt) {
          const evmLeg = skeletonFromEvmRpc(
            ctx,
            receipt,
            await getTransaction(provider, network, evmHash),
            frame,
          );
          evmLeg.kind = "crossing";
          // The %call_evm parameters name the target and the signature better than a selector.
          const params = parseCallEvmParams(op.contents[0]?.parameters?.value);
          if (params.destination?.startsWith("0x")) {
            evmLeg.to = classifyAddress(params.destination, { type: "x_evm_contract" });
          }
          if (params.signature) evmLeg.entrypoint = params.signature;
          root.children.push(evmLeg);
        }
      }
    } else {
      if (receipt) applyReceipt(ctx, root, receipt);
      if (frame) applyCallTrace(ctx, root, frame);
    }

    if (op && level !== undefined) await applyTezosOperation(ctx, root, op, level);
    else if (crossingsInto(root, "michelson").length > 0) {
      warnings.push(
        origin === "evm"
          ? `derived op hash ${opHash} not found in Michelson block ${level ?? "?"}; hash recipe or level mapping may have changed`
          : `operation ${opHash} not found in Michelson block ${level ?? "?"}`,
      );
    }
    const evmLegExpected =
      origin === "evm" ||
      crossingsInto(root, "evm").length > 0 ||
      (op ? opCallsGateway(op) : false);
    if (needsEvm && !receipt && evmLegExpected) {
      warnings.push(
        origin === "michelson"
          ? `derived EVM hash ${evmHash} has no receipt; hash recipe may have changed`
          : `no EVM receipt for ${evmHash}`,
      );
    }
  }

  // A reverted root rolls back every leg that had applied: mark them backtracked so the tree
  // and the explanation never show a green leg inside a red transaction.
  if (root!.status === "reverted") {
    for (const { node } of walkNodes(root!)) {
      if (node !== root && node.status === "success") node.status = "backtracked";
    }
  }
  const { status, atomic } = overallStatus(root!);
  const trace: Trace = {
    schemaVersion: "1",
    network,
    root: root!,
    status,
    atomic,
    explanation: { summary: "" },
    meta: {
      source: fromXtzkt ? "xtzkt+rpc" : "rpc_only",
      correlation: fromXtzkt ? "xtzkt_hash" : "derived_hash",
      fetchedAt: new Date().toISOString(),
      sources: sourcesOf(provider.sources.slice(sourcesStart)),
      warnings,
    },
  };
  if (fromXtzkt) trace.meta.xtzktSchemaObservedAt = trace.meta.fetchedAt;
  trace.explanation = explain(trace);
  return trace;
}

// explain(): the product (CLAUDE.md rule 7). One sentence a developer would agree with, built from
// the deepest failed node. Everything here is derived from a finished Trace; no network.
import { shortAddress } from "./labels.js";
import { extractFailWith, summarizeTezosError } from "./michelson-errors.js";
import type { TezosError } from "./tezos.js";
import { walkNodes, type Explanation, type Trace, type TraceNode } from "./types.js";

function ep(n: TraceNode): string | undefined {
  return n.entrypoint;
}

function describeRoot(root: TraceNode): string {
  const hash = root.hash ? ` ${shortAddress(root.hash)}` : "";
  const target = shortAddress(root.to.value) + (root.to.role === "gateway" ? " (gateway)" : "");
  if (root.runtime === "evm") {
    const fn = ep(root) ? ` calling ${ep(root)}` : "";
    return `EVM tx${hash} from ${shortAddress(root.from.value)} to ${target}${fn}`;
  }
  const e = ep(root) ? ` %${ep(root)}` : "";
  return `Tezos op${hash} from ${shortAddress(root.from.value)} to ${target}${e}`;
}

/** "20000000000000000 wei" -> "0.02 XTZ", "1000 mutez" -> "0.001 XTZ". */
export function humanValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d+) (wei|mutez)$/.exec(value);
  if (!m) return value;
  const decimals = m[2] === "wei" ? 18 : 6;
  const digits = m[1]!.padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const frac = digits.slice(-decimals).replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""} XTZ`;
}

function describeLeg(n: TraceNode): string {
  const to = shortAddress(n.to.value);
  const value = n.value ? ` with ${humanValue(n.value)}` : "";
  if (n.kind === "view") {
    const out = n.output ? ` → ${n.output}` : "";
    return `read Michelson view ${ep(n) ?? "?"} on ${to}${out}`;
  }
  if (n.runtime === "michelson") return `Michelson %${ep(n) ?? "default"} on ${to}${value}`;
  const what = ep(n) ? `EVM ${ep(n)}` : "EVM transfer";
  return `${what} on ${to}${value}`;
}

/** Short reason for a failed node: FAILWITH payload when we have it, else the raw error. */
function reasonOf(n: TraceNode): string | undefined {
  const tezosErr = n.michelsonError as TezosError | undefined;
  const failWith = extractFailWith(tezosErr?.error_message) ?? extractFailWith(n.error);
  if (failWith) return `FAILWITH ${failWith}`;
  return summarizeTezosError(tezosErr) ?? n.error;
}

/** Deepest reverted node; on ties the last one executed. Root excluded unless nothing else failed. */
export function deepestFailure(root: TraceNode): TraceNode | undefined {
  let best: { node: TraceNode; depth: number } | undefined;
  for (const { node, depth } of walkNodes(root)) {
    if (node === root || node.status !== "reverted") continue;
    if (!best || depth >= best.depth) best = { node, depth };
  }
  return best?.node ?? (root.status === "reverted" ? root : undefined);
}

export function explain(trace: Trace): Explanation {
  const root = trace.root;
  const legs = [...walkNodes(root)]
    .map((x) => x.node)
    .filter((n) => n !== root && (n.kind === "crossing" || n.kind === "view"));
  const rootDesc = describeRoot(root);

  if (trace.status === "success") {
    if (legs.length === 0) return { summary: `${rootDesc} applied without crossing runtimes.` };
    const path = legs.map(describeLeg).join(", then ");
    const n = legs.length;
    return {
      summary: `${rootDesc} crossed into ${path}; all ${n} leg${n > 1 ? "s" : ""} applied.`,
    };
  }

  const failed = deepestFailure(root);
  if (!failed) return { summary: `${rootDesc} ${trace.status}; no failed node identified.` };
  const out: Explanation = { summary: "", failedNodeId: failed.id };
  if (failed.error) out.evmReason = failed.error;
  if (failed.michelsonError !== undefined) out.michelsonError = failed.michelsonError;
  const reason = reasonOf(failed);
  const withReason = reason ? ` with ${reason}` : "";

  if (trace.status === "partially_caught") {
    out.summary = `${rootDesc} succeeded, but its cross-runtime call to ${describeLeg(failed)} failed${withReason} and the caller caught the revert; only that leg was rolled back.`;
    return out;
  }

  if (failed === root) {
    out.summary = `${rootDesc} reverted${reason ? `: ${reason}` : ""}; no cross-runtime leg failed.`;
    return out;
  }
  if (failed.runtime === "michelson") {
    out.summary = `${rootDesc} reverted: Michelson entrypoint %${ep(failed) ?? "default"} of ${shortAddress(failed.to.value)} failed${withReason}; whole transaction rolled back on both sides.`;
    return out;
  }
  out.summary = `${rootDesc} failed: EVM call ${ep(failed) ?? "(transfer)"} on ${shortAddress(failed.to.value)} reverted${withReason}; whole operation rolled back on both sides.`;
  return out;
}

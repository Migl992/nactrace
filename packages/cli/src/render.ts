// Tree rendering of a Trace for the terminal. Pure: Trace in, string out. Colors optional.
import { humanValue, shortAddress, walkNodes, type Trace, type TraceNode } from "@nactrace/core";

export interface RenderOptions {
  color?: boolean;
  /** Show raw error strings in full instead of trimming to one line. */
  verbose?: boolean;
}

type Paint = (s: string) => string;
const plain: Paint = (s) => s;

function palette(color: boolean) {
  const c = (open: number, close: number): Paint =>
    color ? (s) => `\u001b[${open}m${s}\u001b[${close}m` : plain;
  return {
    bold: c(1, 22),
    dim: c(2, 22),
    red: c(31, 39),
    green: c(32, 39),
    yellow: c(33, 39),
    blue: c(34, 39),
    magenta: c(35, 39),
    cyan: c(36, 39),
  };
}

function statusMark(p: ReturnType<typeof palette>, status: TraceNode["status"]): string {
  switch (status) {
    case "success":
      return p.green("✓ ok");
    case "reverted":
      return p.red("✗ reverted");
    case "backtracked":
      return p.yellow("↶ backtracked");
    case "skipped":
      return p.dim("– skipped");
  }
}

function gasText(n: TraceNode): string {
  const parts: string[] = [];
  if (n.gas?.used) parts.push(`${n.gas.used} ${n.gas.unit === "evm_gas" ? "gas" : "milligas"}`);
  if (n.michelsonGas?.used) parts.push(`${n.michelsonGas.used} milligas`);
  return parts.join(" / ");
}

function oneLine(s: string, verbose: boolean): string {
  const t = s.replace(/\s+/g, " ").trim();
  return verbose || t.length <= 160 ? t : `${t.slice(0, 157)}…`;
}

function nodeLine(p: ReturnType<typeof palette>, n: TraceNode, isRoot: boolean): string {
  const runtime = n.runtime === "evm" ? p.blue("evm") : p.magenta("michelson");
  const kind = isRoot ? (n.kind === "tx" ? "tx" : "op") : n.kind;
  const arrow = n.kind === "crossing" ? "↘ " : n.kind === "view" ? "👁 " : "";
  const from = shortAddress(n.from.value);
  const to = shortAddress(n.to.value) + (n.to.role === "gateway" ? p.dim(" (gateway)") : "");
  const ep = n.entrypoint
    ? ` ${p.cyan(n.runtime === "michelson" && n.kind !== "view" ? `%${n.entrypoint}` : n.entrypoint)}`
    : "";
  const value = n.value ? p.dim(`  ${humanValue(n.value)}`) : "";
  const gas = gasText(n);
  const gasStr = gas ? p.dim(`  [${gas}]`) : "";
  const hash = isRoot && n.hash ? p.dim(` ${shortAddress(n.hash)}`) : "";
  const synthetic =
    !isRoot && n.synthetic && n.hash ? p.dim(` mirrored ${shortAddress(n.hash)}`) : "";
  return `${arrow}${runtime} ${p.bold(kind)}${hash} ${from} → ${to}${ep}${value}${gasStr}${synthetic}  ${statusMark(p, n.status)}`;
}

function nodeDetails(p: ReturnType<typeof palette>, n: TraceNode, verbose: boolean): string[] {
  const out: string[] = [];
  if (n.error) out.push(`${p.red("error:")} ${oneLine(n.error, verbose)}`);
  const me = n.michelsonError as { id?: string; error_message?: string } | undefined;
  if (me?.error_message || me?.id) {
    out.push(`${p.red("michelson:")} ${oneLine(me.error_message ?? me.id ?? "", verbose)}`);
  }
  if (n.storageDiff) {
    const b = JSON.stringify(n.storageDiff.before);
    const a = JSON.stringify(n.storageDiff.after);
    out.push(`${p.dim("storage:")} ${oneLine(b, verbose)} → ${oneLine(a, verbose)}`);
  }
  if (n.kind === "view" && n.output) out.push(`${p.dim("returned:")} ${n.output}`);
  for (const ev of n.events) {
    if (ev.name === "CrossRuntimeCallSent" || ev.name === "CrossRuntimeCallReceived") {
      const id = String(ev.args?.["crossRuntimeCallId"] ?? "?");
      out.push(`${p.dim("event:")} ${ev.name} id=${id}`);
    }
  }
  if (n.raw?.["caughtByCaller"]) out.push(p.yellow("revert caught by the calling contract"));
  return out;
}

export function renderTree(trace: Trace, opts: RenderOptions = {}): string {
  const p = palette(opts.color ?? false);
  const verbose = opts.verbose ?? false;
  const lines: string[] = [];

  const status =
    trace.status === "success"
      ? p.green("SUCCESS")
      : trace.status === "reverted"
        ? p.red("REVERTED") + (trace.atomic ? p.dim(" (atomic, both sides rolled back)") : "")
        : p.yellow("PARTIALLY CAUGHT");
  lines.push(`${p.bold("nactrace")} ${p.dim(trace.network)}  ${status}`);
  lines.push("");

  // Tree
  const walk = (n: TraceNode, prefix: string, isLast: boolean, isRoot: boolean) => {
    const branch = isRoot ? "" : isLast ? "└─ " : "├─ ";
    lines.push(`${prefix}${branch}${nodeLine(p, n, isRoot)}`);
    const childPrefix = isRoot ? "" : `${prefix}${isLast ? "   " : "│  "}`;
    const detailPrefix = isRoot ? "   " : `${childPrefix}${n.children.length ? "│  " : "   "}`;
    for (const d of nodeDetails(p, n, verbose)) lines.push(`${detailPrefix}${d}`);
    n.children.forEach((c, i) => walk(c, childPrefix, i === n.children.length - 1, false));
  };
  walk(trace.root, "", true, true);

  lines.push("");
  lines.push(`${p.bold("Why:")} ${trace.explanation.summary}`);
  if (trace.explanation.failedNodeId) {
    const failed = [...walkNodes(trace.root)].find(
      (x) => x.node.id === trace.explanation.failedNodeId,
    );
    if (failed?.node.error)
      lines.push(`${p.dim("EVM reason:")} ${oneLine(failed.node.error, verbose)}`);
  }

  const links = [trace.root.links.blockscout, trace.root.links.tzkt].filter(Boolean);
  if (links.length) {
    lines.push("");
    for (const l of links) lines.push(p.dim(`  ${l}`));
  }
  if (trace.meta.warnings.length) {
    lines.push("");
    for (const w of trace.meta.warnings) lines.push(`${p.yellow("warning:")} ${w}`);
  }
  lines.push(p.dim(`source: ${trace.meta.source} (${trace.meta.sources.length} requests)`));
  return lines.join("\n");
}

/** Exit code contract (SPEC §4): 0 success, 1 reverted or partially caught. */
export function exitCodeFor(trace: Trace): number {
  return trace.status === "success" ? 0 : 1;
}

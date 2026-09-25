// HTML rendering for the widget: pure string builders (testable without a DOM), one style sheet.
import { humanValue, shortAddress, walkNodes, type Trace, type TraceNode } from "@nactrace/core";

export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const STYLES = `
:host { all: initial; display: block; }
.nt { font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--nt-fg); background: var(--nt-bg); border: 1px solid var(--nt-border); border-radius: 10px;
  padding: 12px 14px; max-width: 100%; box-sizing: border-box; overflow-wrap: anywhere; }
.nt[data-theme="light"], .nt.auto { --nt-fg: #1c1f24; --nt-bg: #fff; --nt-border: #e2e5ea; --nt-dim: #6b7280;
  --nt-code: #f3f4f6; --nt-ok: #15803d; --nt-bad: #b91c1c; --nt-warn: #b45309; --nt-evm: #2563eb; --nt-mich: #7c3aed; --nt-line: #e5e7eb; }
.nt[data-theme="dark"] { --nt-fg: #e5e7eb; --nt-bg: #0f1115; --nt-border: #2a2f3a; --nt-dim: #9aa3b2;
  --nt-code: #1a1e26; --nt-ok: #4ade80; --nt-bad: #f87171; --nt-warn: #fbbf24; --nt-evm: #60a5fa; --nt-mich: #c084fc; --nt-line: #2a2f3a; }
@media (prefers-color-scheme: dark) { .nt.auto { --nt-fg: #e5e7eb; --nt-bg: #0f1115; --nt-border: #2a2f3a; --nt-dim: #9aa3b2;
  --nt-code: #1a1e26; --nt-ok: #4ade80; --nt-bad: #f87171; --nt-warn: #fbbf24; --nt-evm: #60a5fa; --nt-mich: #c084fc; --nt-line: #2a2f3a; } }
.nt-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.nt-brand { font-weight: 700; letter-spacing: .02em; }
.nt-net { color: var(--nt-dim); }
.nt-pill { border-radius: 999px; padding: 1px 9px; font-weight: 600; font-size: 12px; color: #fff; }
.nt-pill.success { background: var(--nt-ok); } .nt-pill.reverted { background: var(--nt-bad); } .nt-pill.partially_caught { background: var(--nt-warn); }
.nt-why { margin: 8px 0 10px; padding: 8px 10px; border-left: 3px solid var(--nt-border); background: var(--nt-code); border-radius: 6px; }
.nt-why b { font-weight: 700; }
.nt-tl { list-style: none; margin: 0; padding: 0; }
.nt-tl li { display: grid; grid-template-columns: 14px 1fr; gap: 8px; padding: 4px 0; border-top: 1px solid var(--nt-line); }
.nt-tl li:first-child { border-top: 0; }
.nt-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; background: var(--nt-dim); }
.nt-dot.evm { background: var(--nt-evm); } .nt-dot.michelson { background: var(--nt-mich); }
.nt-row { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.nt-kind { font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .04em; color: var(--nt-dim); }
.nt-rt.evm { color: var(--nt-evm); } .nt-rt.michelson { color: var(--nt-mich); }
.nt-ep { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--nt-code); padding: 0 5px; border-radius: 4px; }
.nt-addr { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.nt-meta { color: var(--nt-dim); font-size: 12px; }
.nt-st { font-weight: 600; font-size: 12px; } .nt-st.success { color: var(--nt-ok); } .nt-st.reverted { color: var(--nt-bad); }
.nt-st.backtracked, .nt-st.skipped { color: var(--nt-warn); }
.nt-err { color: var(--nt-bad); font-size: 12px; margin-top: 2px; }
.nt-diff { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: var(--nt-dim); margin-top: 2px; }
.nt-foot { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; font-size: 12px; color: var(--nt-dim); }
.nt-foot a { color: inherit; }
.nt-warn { color: var(--nt-warn); font-size: 12px; margin-top: 6px; }
.nt-loading, .nt-error { color: var(--nt-dim); }
.nt-error { color: var(--nt-bad); }
`;

function statusLabel(s: TraceNode["status"]): string {
  return s === "success" ? "applied" : s;
}

function nodeHtml(node: TraceNode, depth: number, links: Trace["root"]["links"]): string {
  const from = esc(shortAddress(node.from.value));
  const to = esc(shortAddress(node.to.value)) + (node.to.role === "gateway" ? " (gateway)" : "");
  const ep = node.entrypoint
    ? `<span class="nt-ep">${esc(node.runtime === "michelson" && node.kind !== "view" ? `%${node.entrypoint}` : node.entrypoint)}</span>`
    : "";
  const value = node.value ? `<span class="nt-meta">${esc(humanValue(node.value))}</span>` : "";
  const gas: string[] = [];
  if (node.gas?.used)
    gas.push(`${node.gas.used} ${node.gas.unit === "evm_gas" ? "gas" : "milligas"}`);
  if (node.michelsonGas?.used) gas.push(`${node.michelsonGas.used} milligas`);
  const gasHtml = gas.length ? `<span class="nt-meta">${esc(gas.join(" / "))}</span>` : "";
  const err = node.error
    ? `<div class="nt-err">${esc(node.error.length > 220 ? node.error.slice(0, 217) + "…" : node.error)}</div>`
    : "";
  const me = node.michelsonError as { error_message?: string } | undefined;
  const mich = me?.error_message
    ? `<div class="nt-err">${esc(me.error_message.length > 220 ? me.error_message.slice(0, 217) + "…" : me.error_message)}</div>`
    : "";
  const diff = node.storageDiff
    ? `<div class="nt-diff">storage ${esc(JSON.stringify(node.storageDiff.before))} → ${esc(JSON.stringify(node.storageDiff.after))}</div>`
    : "";
  const out =
    node.kind === "view" && node.output
      ? `<div class="nt-diff">returned ${esc(node.output)}</div>`
      : "";
  const caught = node.raw?.["caughtByCaller"]
    ? `<div class="nt-warn">revert caught by the caller</div>`
    : "";
  const hashLink =
    depth === 0 && node.hash
      ? `<a class="nt-addr" href="${esc(node.runtime === "evm" ? (links.blockscout ?? "#") : (links.tzkt ?? "#"))}" target="_blank" rel="noopener">${esc(shortAddress(node.hash))}</a>`
      : "";
  const kindLabel = depth === 0 ? (node.kind === "tx" ? "tx" : "op") : node.kind.replace("_", " ");
  return `<li style="margin-left:${depth * 14}px">
  <span class="nt-dot ${node.runtime}"></span>
  <div>
    <div class="nt-row">
      <span class="nt-kind"><span class="nt-rt ${node.runtime}">${node.runtime}</span> ${esc(kindLabel)}</span>
      ${hashLink}
      <span class="nt-addr">${from} → ${to}</span>
      ${ep}${value}${gasHtml}
      <span class="nt-st ${node.status}">${esc(statusLabel(node.status))}</span>
    </div>
    ${err}${mich}${diff}${out}${caught}
  </div>
</li>`;
}

export function renderTrace(trace: Trace, theme: "light" | "dark" | "auto" = "auto"): string {
  const status =
    trace.status === "success"
      ? "success"
      : trace.status === "reverted"
        ? "reverted" + (trace.atomic ? " · atomic" : "")
        : "partially caught";
  const items = [...walkNodes(trace.root)]
    .map(({ node, depth }) => nodeHtml(node, depth, trace.root.links))
    .join("");
  const links = [
    trace.root.links.blockscout
      ? `<a href="${esc(trace.root.links.blockscout)}" target="_blank" rel="noopener">Blockscout</a>`
      : "",
    trace.root.links.tzkt
      ? `<a href="${esc(trace.root.links.tzkt)}" target="_blank" rel="noopener">TzKT</a>`
      : "",
    `<span>${esc(trace.meta.source)} · ${trace.meta.sources.length} requests</span>`,
  ]
    .filter(Boolean)
    .join("");
  const warnings = trace.meta.warnings
    .map((w) => `<div class="nt-warn">⚠ ${esc(w)}</div>`)
    .join("");
  return `<div class="nt ${theme === "auto" ? "auto" : ""}" data-theme="${theme}">
  <div class="nt-head"><span class="nt-brand">nactrace</span><span class="nt-net">${esc(trace.network)}</span><span class="nt-pill ${trace.status}">${esc(status)}</span></div>
  <div class="nt-why"><b>Why:</b> ${esc(trace.explanation.summary)}</div>
  <ul class="nt-tl">${items}</ul>
  ${warnings}
  <div class="nt-foot">${links}</div>
</div>`;
}

export function renderLoading(hash: string, theme: "light" | "dark" | "auto" = "auto"): string {
  return `<div class="nt ${theme === "auto" ? "auto" : ""}" data-theme="${theme}"><div class="nt-head"><span class="nt-brand">nactrace</span></div><div class="nt-loading">Tracing ${esc(shortAddress(hash))}…</div></div>`;
}

export function renderError(message: string, theme: "light" | "dark" | "auto" = "auto"): string {
  return `<div class="nt ${theme === "auto" ? "auto" : ""}" data-theme="${theme}"><div class="nt-head"><span class="nt-brand">nactrace</span></div><div class="nt-error">${esc(message)}</div></div>`;
}

// nactrace.js — embeddable widget. Drop one script tag on any page:
//   <script src="https://cdn.jsdelivr.net/npm/@nactrace/widget/dist/nactrace.js"
//           data-hash="0x…" data-network="previewnet" data-theme="auto"></script>
// It mounts itself right after the tag. Programmatic use: window.nactrace.mount(el, { hash, network }).
// Talks to 0xTzKT and the public EVM / Michelson nodes straight from the browser (all allow CORS).
import { buildTrace, Provider, type NetworkName, type Trace } from "@nactrace/core";
import { renderError, renderLoading, renderTrace, STYLES } from "./render.js";

export type Theme = "light" | "dark" | "auto";

export interface MountOptions {
  hash: string;
  network?: NetworkName;
  /** false: 0xTzKT skeleton only, no node calls. Default true. */
  enrich?: boolean;
  theme?: Theme;
  /** Custom Provider (tests, caching, record/replay). Default: a fresh live Provider. */
  provider?: Provider;
}

export const version = "1.0.0";

function shadowOf(target: HTMLElement): ShadowRoot {
  const root = target.shadowRoot ?? target.attachShadow({ mode: "open" });
  if (!root.querySelector("style")) {
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);
  }
  return root;
}

function setBody(root: ShadowRoot, html: string): void {
  let body = root.querySelector<HTMLElement>(".nt-body");
  if (!body) {
    body = document.createElement("div");
    body.className = "nt-body";
    root.appendChild(body);
  }
  body.innerHTML = html;
}

/** Render the trace of `hash` into `target`. Resolves with the Trace, or undefined on error. */
export async function mount(target: HTMLElement, opts: MountOptions): Promise<Trace | undefined> {
  const theme = opts.theme ?? "auto";
  const root = shadowOf(target);
  setBody(root, renderLoading(opts.hash, theme));
  try {
    const trace = await buildTrace(opts.hash, {
      provider: opts.provider ?? new Provider(),
      ...(opts.network ? { network: opts.network } : {}),
      enrich: opts.enrich ?? true,
    });
    setBody(root, renderTrace(trace, theme));
    target.dispatchEvent(new CustomEvent("nactrace:trace", { detail: trace, bubbles: true }));
    return trace;
  } catch (e) {
    setBody(root, renderError((e as Error).message, theme));
    target.dispatchEvent(new CustomEvent("nactrace:error", { detail: e, bubbles: true }));
    return undefined;
  }
}

/** Mount for every <script data-hash> (the current one when run as an IIFE). */
export function autoMount(
  script: HTMLScriptElement | null = document.currentScript as HTMLScriptElement | null,
): void {
  const hash = script?.dataset["hash"];
  if (!script || !hash) return;
  const host = document.createElement("div");
  host.className = "nactrace-widget";
  const targetSel = script.dataset["target"];
  const parent = targetSel ? document.querySelector(targetSel) : null;
  if (parent) parent.appendChild(host);
  else script.insertAdjacentElement("afterend", host);
  const network = script.dataset["network"] as NetworkName | undefined;
  const theme = (script.dataset["theme"] as Theme | undefined) ?? "auto";
  void mount(host, {
    hash,
    ...(network ? { network } : {}),
    enrich: script.dataset["enrich"] !== "false",
    theme,
  });
}

export { renderTrace, renderLoading, renderError, STYLES } from "./render.js";

if (typeof document !== "undefined") autoMount();

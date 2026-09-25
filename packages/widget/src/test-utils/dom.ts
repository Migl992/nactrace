// A real DOM for widget tests without switching the vitest environment (which would make vite
// treat the test as browser code and drop node:fs). happy-dom's Window is installed on globalThis.
import { Window } from "happy-dom";

export function installDom(): Window {
  const window = new Window({ url: "https://example.test/" });
  const g = globalThis as Record<string, unknown>;
  g["window"] = window;
  g["document"] = window.document;
  for (const k of ["HTMLElement", "HTMLScriptElement", "CustomEvent", "Node", "ShadowRoot"]) {
    g[k] = (window as unknown as Record<string, unknown>)[k];
  }
  return window;
}

// Executes the BUILT bundle (dist/nactrace.js) the way a page would: a <script data-hash> tag,
// document.currentScript set, fetch replaying fixtures/raw. Skips itself when dist is missing.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installDom } from "./test-utils/dom.js";

installDom();
import { makeReplayFetch } from "../../core/src/test-utils/faultyReplay.js";

const BUNDLE = fileURLToPath(new URL("../dist/nactrace.js", import.meta.url));
const REVERT = "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716";
const MAINNET_OP = "opZX4Z3TuidPmJDB93WatMNKBfbkDQipUXvFiVeS6LY9JiovffV";

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for the widget");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe.skipIf(!existsSync(BUNDLE))("built bundle in a DOM", () => {
  const code = existsSync(BUNDLE) ? readFileSync(BUNDLE, "utf8") : "";

  it("mounts from its own <script data-hash> tag and renders the revert", async () => {
    globalThis.fetch = makeReplayFetch();
    const script = document.createElement("script");
    script.dataset["hash"] = REVERT;
    script.dataset["network"] = "previewnet";
    document.body.appendChild(script);
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => script });
    // The bundle starts with "use strict", which scopes its `var nactrace` to the eval; a page script has it global.
    (0, eval)(code + "\n;globalThis.nactrace = nactrace;"); // newline: the file ends with a sourcemap comment
    Object.defineProperty(document, "currentScript", { configurable: true, get: () => null });

    const g = globalThis as unknown as { nactrace?: { version: string; mount: unknown } };
    expect(g.nactrace?.version).toBe("0.1.0");
    expect(typeof g.nactrace?.mount).toBe("function");
    const host = script.nextElementSibling as HTMLElement;
    expect(host.className).toBe("nactrace-widget");
    await until(() => Boolean(host.shadowRoot?.querySelector(".nt-pill")));
    const root = host.shadowRoot!;
    expect(root.querySelector(".nt-pill")?.textContent).toBe("reverted · atomic");
    expect(root.querySelector(".nt-why")?.textContent).toContain('FAILWITH "at zero"');
    expect(root.querySelectorAll(".nt-tl li")).toHaveLength(2);
  });

  it("programmatic mount with network auto-detection through 0xTzKT", async () => {
    globalThis.fetch = makeReplayFetch();
    const g = globalThis as unknown as {
      nactrace: {
        mount: (
          el: HTMLElement,
          o: { hash: string },
        ) => Promise<{ network: string; status: string } | undefined>;
      };
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const trace = await g.nactrace.mount(host, { hash: MAINNET_OP });
    expect(trace?.network).toBe("mainnet");
    expect(trace?.status).toBe("success");
    expect(host.shadowRoot!.querySelector(".nt-net")?.textContent).toBe("mainnet");
    expect(host.shadowRoot!.textContent).toContain("debug_traceTransaction unavailable on mainnet");
  });
});

// Offline widget tests: real DOM (happy-dom), traces replayed from fixtures/raw.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Provider, type Trace } from "@nactrace/core";
import { FileFixtureStore } from "@nactrace/core/node";
import { describe, expect, it } from "vitest";
import { installDom } from "./test-utils/dom.js";

installDom();
const { autoMount, mount } = await import("./index.js");
import { esc, renderError, renderLoading, renderTrace } from "./render.js";

const RAW = fileURLToPath(new URL("../../../fixtures/raw", import.meta.url));
const TRACES = fileURLToPath(new URL("../../../fixtures/traces/", import.meta.url));
const replay = () => new Provider({ mode: "replay", store: new FileFixtureStore(RAW) });
const load = (net: string, hash: string): Trace =>
  JSON.parse(readFileSync(`${TRACES}${net}/${hash}.json`, "utf8")) as Trace;

const REVERT = "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716";
const NESTED = "oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W";
const CAUGHT = "0x7db675f6db248befb77d063408237bfad74890dd0079531e10e891df957cfb4f";

describe("render (strings)", () => {
  it("escapes HTML in everything it prints", () => {
    expect(esc('<b>"x" & y</b>')).toBe("&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
    const t = load("previewnet", REVERT);
    t.explanation.summary = "<script>alert(1)</script>";
    expect(renderTrace(t)).not.toContain("<script>");
    expect(renderTrace(t)).toContain("&lt;script&gt;");
  });

  it("renders status pill, explanation, both legs, errors, storage diff and links", () => {
    const html = renderTrace(load("previewnet", REVERT));
    expect(html).toContain('class="nt-pill reverted"');
    expect(html).toContain("reverted · atomic");
    expect(html).toContain("<b>Why:</b> EVM tx 0x3977…f716");
    expect(html).toContain("%decrement");
    expect(html).toContain(
      "storage {&quot;int&quot;:&quot;0&quot;} → {&quot;int&quot;:&quot;0&quot;}",
    );
    expect(html).toContain("Cross-runtime call failed with status 400 Bad Request");
    expect(html).toContain(
      'href="https://blockscout.previewnet.tezosx.nomadic-labs.com/tx/' + REVERT,
    );
    expect(html).toContain(
      "https://tzkt.previewnet.tezosx.nomadic-labs.com/opEnkkJMcLqyuuVBfPC5neVFZ8mCYibXf8VqtP7MRvEBWNAmSry",
    );
  });

  it("indents nested legs and shows both gas units", () => {
    const html = renderTrace(load("previewnet", NESTED), "dark");
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('style="margin-left:14px"');
    expect(html).toContain('style="margin-left:28px"');
    expect(html).toMatch(/\d+ gas \/ \d+ milligas/);
  });

  it("loading and error states", () => {
    expect(renderLoading(REVERT)).toContain("Tracing 0x3977…f716…");
    expect(renderError("boom <x>")).toContain("boom &lt;x&gt;");
  });
});

describe("mount (happy-dom)", () => {
  it("renders into a shadow root and emits nactrace:trace", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const events: string[] = [];
    host.addEventListener("nactrace:trace", () => events.push("trace"));
    const trace = await mount(host, { hash: REVERT, provider: replay() });
    expect(trace?.status).toBe("reverted");
    expect(events).toEqual(["trace"]);
    const root = host.shadowRoot!;
    expect(root.querySelector("style")?.textContent).toContain(".nt-pill");
    expect(root.querySelector(".nt-pill")?.textContent).toBe("reverted · atomic");
    expect(root.querySelectorAll(".nt-tl li")).toHaveLength(2);
    expect(root.querySelector(".nt-why")?.textContent).toContain('FAILWITH "at zero"');
  });

  it("shows the error state and emits nactrace:error for an unknown hash", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const events: string[] = [];
    host.addEventListener("nactrace:error", () => events.push("error"));
    const trace = await mount(host, { hash: "0x" + "11".repeat(32), provider: replay() });
    expect(trace).toBeUndefined();
    expect(events).toEqual(["error"]);
    expect(host.shadowRoot!.querySelector(".nt-error")?.textContent).toMatch(
      /does not know|no fixture/,
    );
  });

  it("partially caught crossings get the amber pill and the caught note", async () => {
    const host = document.createElement("div");
    const trace = await mount(host, { hash: CAUGHT, network: "previewnet", provider: replay() });
    expect(trace?.status).toBe("partially_caught");
    expect(host.shadowRoot!.querySelector(".nt-pill")?.className).toContain("partially_caught");
    expect(host.shadowRoot!.textContent).toContain("revert caught by the caller");
  });

  it("autoMount reads data-* from the script tag and mounts after it", async () => {
    const script = document.createElement("script");
    script.dataset["hash"] = NESTED;
    script.dataset["theme"] = "light";
    document.body.appendChild(script);
    autoMount(script);
    const host = script.nextElementSibling as HTMLElement;
    expect(host.className).toBe("nactrace-widget");
    expect(host.shadowRoot!.querySelector(".nt-loading")?.textContent).toContain(
      "Tracing oo3MF…E16W",
    );
    // no data-network and a live Provider: it would hit the network, so stop here.
    expect(autoMount(null)).toBeUndefined();
  });
});

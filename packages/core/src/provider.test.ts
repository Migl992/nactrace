import { describe, expect, it, vi } from "vitest";
import { MemoryFixtureStore, Provider, ProviderError, requestKey } from "./provider.js";

function fakeFetch(
  handler: (url: string, init?: RequestInit) => { status?: number; body: unknown },
) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const { status = 200, body } = handler(url, init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
  return fn as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("Provider", () => {
  it("dedupes identical requests through the in-memory cache", async () => {
    const fetch = fakeFetch(() => ({ body: [{ direction: "x_evm" }] }));
    const p = new Provider({ fetch });
    const url = "https://api.previewnet.xtzkt.io/v1/operations/transaction?hash=0xabc";
    const [a, b] = await Promise.all([p.getJson(url), p.getJson(url)]);
    expect(a).toEqual(b);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(p.sources).toHaveLength(1);
  });

  it("records into a store, then replays without fetch", async () => {
    const store = new MemoryFixtureStore();
    const fetch = fakeFetch((_url, init) => {
      const { method } = JSON.parse(String(init?.body)) as { method: string };
      return { body: { jsonrpc: "2.0", id: 1, result: { via: method } } };
    });
    const rec = new Provider({ mode: "record", store, fetch });
    const live = await rec.rpc("https://evm.previewnet.tezosx.nomadic-labs.com", "eth_chainId", []);
    expect(live.result).toEqual({ via: "eth_chainId" });
    expect(store.entries.size).toBe(1);

    const replayFetch = fakeFetch(() => ({ body: "should not be called" }));
    const rep = new Provider({ mode: "replay", store, fetch: replayFetch });
    const replayed = await rep.rpc(
      "https://evm.previewnet.tezosx.nomadic-labs.com",
      "eth_chainId",
      [],
    );
    expect(replayed).toEqual(live);
    expect(replayFetch).not.toHaveBeenCalled();
  });

  it("throws ProviderError in replay mode when a fixture is missing", async () => {
    const p = new Provider({ mode: "replay", store: new MemoryFixtureStore() });
    await expect(p.get("https://api.xtzkt.io/v1/nothing")).rejects.toBeInstanceOf(ProviderError);
  });

  it("surfaces HTTP errors with their status and caches them like any other answer", async () => {
    // A 404 is a deterministic answer (e.g. storage of a contract that did not exist yet at
    // that level), so it is cached and recorded; only transport failures are not.
    const fetch = fakeFetch(() => ({ status: 404, body: { error: "not found" } }));
    const p = new Provider({ fetch });
    await expect(p.get("https://api.xtzkt.io/v1/x")).rejects.toMatchObject({ status: 404 });
    await expect(p.get("https://api.xtzkt.io/v1/x")).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache transport failures", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      if (calls++ === 0) throw new Error("ECONNRESET");
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    const p = new Provider({ fetch: fetchImpl });
    await expect(p.get("https://api.xtzkt.io/v1/x")).rejects.toBeInstanceOf(ProviderError);
    await expect(p.getJson("https://api.xtzkt.io/v1/x")).resolves.toEqual([]);
  });

  it("keeps non-JSON bodies as text", async () => {
    const p = new Provider({ fetch: fakeFetch(() => ({ body: '"12345"' })) });
    // Tezos RPC returns bare JSON strings for balances; a non-JSON body would stay text.
    expect(await p.getJson("https://michelson.previewnet.tezosx.nomadic-labs.com/x")).toBe("12345");
  });

  it("requestKey distinguishes params", () => {
    const a = requestKey({ kind: "rpc", url: "u", method: "m", params: [1] });
    const b = requestKey({ kind: "rpc", url: "u", method: "m", params: [2] });
    expect(a).not.toBe(b);
  });
});

describe("Provider in a browser-like environment", () => {
  it("calls the global fetch with the right `this` (browsers throw Illegal invocation otherwise)", async () => {
    const original = globalThis.fetch;
    // Mimic window.fetch: it must be invoked on the global object (or unbound), never on another object.
    const strictFetch = function (this: unknown, input: string | URL | Request) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(new Response(JSON.stringify([{ ok: String(input).length > 0 }])));
    } as unknown as typeof fetch;
    globalThis.fetch = strictFetch;
    try {
      const p = new Provider();
      await expect(p.getJson("https://api.xtzkt.io/v1/x")).resolves.toEqual([{ ok: true }]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

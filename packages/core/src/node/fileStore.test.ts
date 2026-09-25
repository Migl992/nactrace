import { describe, expect, it } from "vitest";
import { fixtureRelPath, networkForUrl } from "./fileStore.js";

describe("FileFixtureStore paths", () => {
  it("detects the network from any of its three base URLs", () => {
    expect(networkForUrl("https://api.previewnet.xtzkt.io/v1/x")).toBe("previewnet");
    expect(networkForUrl("https://node.mainnet.etherlink.com")).toBe("mainnet");
    expect(networkForUrl("https://michelson.etherlink.shadownet.octez.io/chains/main")).toBe(
      "shadownet",
    );
    expect(networkForUrl("https://example.com")).toBeUndefined();
  });

  it("maps requests to readable, deterministic files", () => {
    expect(
      fixtureRelPath({
        kind: "get",
        url: "https://api.previewnet.xtzkt.io/v1/operations/transaction?hash=0xabc",
      }),
    ).toBe("previewnet/xtzkt/operations_transaction_hash_0xabc.json");
    expect(fixtureRelPath({ kind: "get", url: "https://api.xtzkt.io/v1/openapi.json" })).toBe(
      "mainnet/xtzkt/openapi.json",
    );
    expect(
      fixtureRelPath({
        kind: "get",
        url: "https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/12/operations",
      }),
    ).toBe("previewnet/tezos/blocks_12_operations.json");
    expect(
      fixtureRelPath({
        kind: "rpc",
        url: "https://node.mainnet.etherlink.com",
        method: "eth_getTransactionReceipt",
        params: ["0xabc"],
      }),
    ).toBe("mainnet/evm/eth_getTransactionReceipt.0xabc.json");
  });

  it("includes a digest of extra params so tracer configs cannot collide", () => {
    const a = fixtureRelPath({
      kind: "rpc",
      url: "https://node.mainnet.etherlink.com",
      method: "debug_traceTransaction",
      params: ["0xabc", { tracer: "callTracer" }],
    });
    const b = fixtureRelPath({
      kind: "rpc",
      url: "https://node.mainnet.etherlink.com",
      method: "debug_traceTransaction",
      params: ["0xabc", { tracer: "prestateTracer" }],
    });
    expect(a).toMatch(/^mainnet\/evm\/debug_traceTransaction\.0xabc\.[0-9a-f]{12}\.json$/);
    expect(a).not.toBe(b);
  });
});

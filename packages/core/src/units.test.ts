// Small units with error paths: hashes, labels, humanValue, file store round trip, provider RPC errors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { humanValue } from "./explain.js";
import {
  bytesToHex,
  decodeOpHash,
  encodeOpHash,
  hexToBytes,
  syntheticEvmTxHashBytes,
  syntheticMichelsonOpHashBytes,
} from "./hashes.js";
import { classifyAddress, shortAddress } from "./labels.js";
import { FileFixtureStore } from "./node/fileStore.js";
import { Provider, ProviderError } from "./provider.js";
import { extractFailWith, humanizeTezosMessage } from "./michelson-errors.js";

describe("hashes: invalid inputs", () => {
  it("rejects odd or non-hex strings and wrong lengths", () => {
    expect(() => hexToBytes("0xabc")).toThrow(/invalid hex/);
    expect(() => hexToBytes("0xzz")).toThrow(/invalid hex/);
    expect(() => syntheticMichelsonOpHashBytes("0x1234")).toThrow(/32 bytes/);
    expect(() => syntheticEvmTxHashBytes(new Uint8Array(31))).toThrow(/32 bytes/);
    expect(() => encodeOpHash(new Uint8Array(20))).toThrow(/32 bytes/);
  });

  it("rejects op hashes with a wrong prefix or bad base58", () => {
    expect(() => decodeOpHash("KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw")).toThrow();
    expect(() => decodeOpHash("o0000000000000000000000000000000000000000000000000")).toThrow();
    expect(() => decodeOpHash("")).toThrow();
  });

  it("hex helpers round-trip", () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
    expect(hexToBytes(bytesToHex(bytes).slice(2))).toEqual(bytes);
  });
});

describe("labels", () => {
  it("classifies gateways, system accounts, aliases and natives", () => {
    expect(classifyAddress("0xFF00000000000000000000000000000000000007").role).toBe("gateway");
    expect(classifyAddress("KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw").label).toBe(
      "NAC gateway (Michelson side)",
    );
    expect(classifyAddress("0x7e20580000000000000000000000000000000001").role).toBe("system");
    expect(classifyAddress("tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU").role).toBe("system");
    const alias = classifyAddress("KT1TA7PnMEKLeGgTLXZVk1QmeRoUSzUq3XK2", {
      type: "x_michelson_alias",
      counterpart: "0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d",
    });
    expect(alias.role).toBe("alias");
    expect(alias.label).toBe("alias of 0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d");
    expect(
      classifyAddress("tz1Tj26he8NbyEuiMGZerWUYCXNnzkvTA3Mh", { type: "x_michelson_user" }),
    ).toEqual({
      value: "tz1Tj26he8NbyEuiMGZerWUYCXNnzkvTA3Mh",
      runtime: "michelson",
      role: "native",
    });
    expect(classifyAddress("0xabc").role).toBe("unknown");
  });

  it("shortens addresses of both runtimes and leaves short strings alone", () => {
    expect(shortAddress("0x2caddb07bb2893c85f48a58e9e605bdb96f787b3")).toBe("0x2cad…87b3");
    expect(shortAddress("KT1LT2vXbnTvjjsfZJQnArm21orXLsh95Tgv")).toBe("KT1LT…5Tgv");
    expect(shortAddress("?")).toBe("?");
  });
});

describe("humanValue", () => {
  it("formats wei and mutez as XTZ", () => {
    expect(humanValue("20000000000000000 wei")).toBe("0.02 XTZ");
    expect(humanValue("1000000000000000000 wei")).toBe("1 XTZ");
    expect(humanValue("1 wei")).toBe("0.000000000000000001 XTZ");
    expect(humanValue("1000 mutez")).toBe("0.001 XTZ");
    expect(humanValue("1000000 mutez")).toBe("1 XTZ");
    expect(humanValue("0 mutez")).toBe("0 XTZ");
    expect(humanValue("odd")).toBe("odd");
    expect(humanValue(undefined)).toBeUndefined();
  });
});

describe("michelson error wrappers", () => {
  it("unwraps the observed kernel error shapes", () => {
    expect(humanizeTezosMessage("Transfer(OutOfGas(OutOfGas))")).toBe("out of gas");
    expect(
      humanizeTezosMessage(
        'Transfer(ContractDoesNotExist(Originated(ContractKt1Hash("KT1EnHh4EQRQqcHaxaRD4f7X7XyWjuQ4gnBN"))))',
      ),
    ).toBe("contract KT1EnHh4EQRQqcHaxaRD4f7X7XyWjuQ4gnBN does not exist");
    expect(
      humanizeTezosMessage(
        'Transfer(MichelsonContractInterpretError("failed typechecking input: no such entrypoint: nope"))',
      ),
    ).toBe("failed typechecking input: no such entrypoint: nope");
    expect(humanizeTezosMessage("Something(new)")).toBe("Something(new)");
    expect(extractFailWith('failed with: Pair("a" 1) of type pair')).toBe('Pair("a" 1)');
  });
});

describe("FileFixtureStore on disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "nactrace-store-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("records and replays JSON, text and non-200 answers", async () => {
    const store = new FileFixtureStore(dir);
    const get = {
      kind: "get" as const,
      url: "https://api.previewnet.xtzkt.io/v1/operations/transaction?hash=0x1",
    };
    const rpc = {
      kind: "rpc" as const,
      url: "https://evm.previewnet.tezosx.nomadic-labs.com",
      method: "eth_getBalance",
      params: ["0xabc", "latest"],
    };
    const notFound = {
      kind: "get" as const,
      url: "https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/5/context/contracts/KT1x/storage",
    };
    await store.set(get, { status: 200, body: [{ direction: "x_evm" }], fetchedAt: "t1" });
    await store.set(rpc, { status: 200, body: { result: "0x1" }, fetchedAt: "t2" });
    await store.set(notFound, { status: 404, body: "not found", fetchedAt: "t3" });
    expect(await store.get(get)).toEqual({
      status: 200,
      body: [{ direction: "x_evm" }],
      fetchedAt: "t1",
    });
    expect((await store.get(rpc))?.body).toEqual({ result: "0x1" });
    expect(await store.get(notFound)).toEqual({ status: 404, body: "not found", fetchedAt: "t3" });
    expect(await store.get({ kind: "get", url: "https://api.xtzkt.io/v1/never" })).toBeUndefined();

    // A replay provider over that store surfaces the 404 as a ProviderError with its status.
    const p = new Provider({ mode: "replay", store });
    await expect(p.get(notFound.url)).rejects.toMatchObject({ status: 404 });
    expect(await p.getJson(get.url)).toEqual([{ direction: "x_evm" }]);
  });
});

describe("Provider RPC error paths", () => {
  const rpcUrl = "https://node.mainnet.etherlink.com";
  const respond = (status: number, body: string) =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

  it("HTTP 500 on an RPC call is a ProviderError with the status", async () => {
    const p = new Provider({ fetch: respond(500, "boom") });
    await expect(p.rpc(rpcUrl, "eth_chainId", [])).rejects.toMatchObject({ status: 500 });
  });

  it("non-JSON body on an RPC call is a ProviderError", async () => {
    const p = new Provider({ fetch: respond(200, "<html>rate limited</html>") });
    await expect(p.rpc(rpcUrl, "eth_chainId", [])).rejects.toBeInstanceOf(ProviderError);
  });

  it("JSON-RPC error envelopes are returned, not thrown", async () => {
    const p = new Provider({
      fetch: respond(
        200,
        JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "nope" } }),
      ),
    });
    const r = await p.rpc(rpcUrl, "eth_chainId", []);
    expect(r.error?.code).toBe(-32601);
  });

  it("refuses record/replay without a store", () => {
    expect(() => new Provider({ mode: "replay" })).toThrow(/needs a FixtureStore/);
  });
});

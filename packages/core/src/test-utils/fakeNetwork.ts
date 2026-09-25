// A Provider whose "network" is a table of canned answers, for error-injection tests.
// Each rule matches a request key prefix (see requestKey) and returns a body, a status, or throws.
import { Provider, requestKey, type ProviderRequest } from "../provider.js";

export type FakeAnswer =
  | { body: unknown; status?: number }
  | { throw: string }
  | ((req: ProviderRequest) => { body: unknown; status?: number });

export interface FakeNetwork {
  provider: Provider;
  calls: string[];
  /** Add or replace a rule. Longest matching prefix wins. */
  on(prefix: string, answer: FakeAnswer): FakeNetwork;
}

export function fakeNetwork(rules: Record<string, FakeAnswer> = {}): FakeNetwork {
  const table = new Map<string, FakeAnswer>(Object.entries(rules));
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let req: ProviderRequest;
    if (init?.method === "POST") {
      const { method, params } = JSON.parse(String(init.body)) as {
        method: string;
        params: unknown[];
      };
      req = { kind: "rpc", url, method, params };
    } else {
      req = { kind: "get", url };
    }
    const key = requestKey(req);
    calls.push(key);
    let best: FakeAnswer | undefined;
    let bestLen = -1;
    for (const [prefix, answer] of table) {
      if (key.startsWith(prefix) && prefix.length > bestLen) {
        best = answer;
        bestLen = prefix.length;
      }
    }
    if (!best)
      return new Response(JSON.stringify({ error: `no rule for ${key}` }), { status: 404 });
    if (typeof best === "function") best = best(req);
    if ("throw" in best) throw new Error(best.throw);
    const body =
      req.kind === "rpc" ? { jsonrpc: "2.0", id: 1, ...(best.body as object) } : best.body;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: best.status ?? 200,
    });
  }) as unknown as typeof fetch;
  const net: FakeNetwork = {
    provider: new Provider({ fetch: fetchImpl }),
    calls,
    on(prefix, answer) {
      table.set(prefix, answer);
      return net;
    },
  };
  return net;
}

export const XTZKT = {
  previewnet: "GET https://api.previewnet.xtzkt.io/v1/operations/transaction?hash=",
  mainnet: "GET https://api.xtzkt.io/v1/operations/transaction?hash=",
  shadownet: "GET https://api.shadownet.xtzkt.io/v1/operations/transaction?hash=",
};
export const EVM = "RPC https://evm.previewnet.tezosx.nomadic-labs.com ";
export const TEZOS = "GET https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/";

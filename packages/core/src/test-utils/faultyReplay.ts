// Replay from fixtures/raw through a real fetch-shaped function, with faults injected per
// request-key prefix: a thrown transport error, an HTTP status, or a replacement body.
// Lets trace tests exercise "0xTzKT down", "node returns 500", "trace refused", … offline.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureRelPath } from "../node/fileStore.js";
import { Provider, requestKey, type ProviderRequest } from "../provider.js";
import { FIXTURES_ROOT } from "./replay.js";

export type Fault =
  | { throw: string }
  | { status: number; body?: unknown }
  | { body: unknown }
  | ((req: ProviderRequest) => { status?: number; body: unknown });

export interface FaultyReplay {
  provider: Provider;
  calls: string[];
}

export function faultyReplay(faults: Record<string, Fault>): FaultyReplay {
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

    let fault: Fault | undefined;
    let bestLen = -1;
    for (const [prefix, f] of Object.entries(faults)) {
      if (key.startsWith(prefix) && prefix.length > bestLen) {
        fault = f;
        bestLen = prefix.length;
      }
    }
    if (fault) {
      if (typeof fault === "function") {
        const r = fault(req);
        return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
      }
      if ("throw" in fault) throw new Error(fault.throw);
      const body = "body" in fault ? fault.body : { error: "injected" };
      return new Response(JSON.stringify(body), { status: "status" in fault ? fault.status : 200 });
    }

    const rel = fixtureRelPath(req);
    const path = join(FIXTURES_ROOT, ...rel.split("/"));
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      return new Response(JSON.stringify({ error: `no fixture for ${key}` }), { status: 404 });
    }
    let status = 200;
    try {
      const meta = JSON.parse(readFileSync(path.replace(/\.json$/, ".meta.json"), "utf8")) as {
        status?: number;
      };
      status = meta.status ?? 200;
    } catch {
      /* no sidecar */
    }
    return new Response(text, { status });
  }) as unknown as typeof fetch;
  return { provider: new Provider({ fetch: fetchImpl }), calls };
}

export const K = {
  xtzktPreviewnet: "GET https://api.previewnet.xtzkt.io/v1/operations/transaction?hash=",
  xtzktMainnet: "GET https://api.xtzkt.io/v1/operations/transaction?hash=",
  xtzktShadownet: "GET https://api.shadownet.xtzkt.io/v1/operations/transaction?hash=",
  evmPreviewnet: "RPC https://evm.previewnet.tezosx.nomadic-labs.com ",
  tezosPreviewnet: "GET https://michelson.previewnet.tezosx.nomadic-labs.com/chains/main/blocks/",
};

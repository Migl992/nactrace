// Node-only FixtureStore that lays recorded responses out as readable files under a root dir:
//   <network>/xtzkt/<path_and_query>.json
//   <network>/evm/<method>.<first param>[.<hash of other params>].json
//   <network>/tezos/<path>.json
// plus a `.meta.json` sidecar (request, status, fetchedAt). Anything unrecognised goes under
// other/<sha256 of the request key>.json. Exported from "@nactrace/core/node", never from the
// browser entry.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "../hashes.js";
import { NETWORKS, type NetworkName } from "../networks.js";
import {
  requestKey,
  type FixtureStore,
  type ProviderRequest,
  type StoredResponse,
} from "../provider.js";

function sanitize(s: string): string {
  return s
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.json$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_");
}

function shortHash(s: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(s))).slice(2, 14);
}

export function networkForUrl(url: string): NetworkName | undefined {
  for (const net of Object.values(NETWORKS)) {
    if ([net.evmRpc, net.michelsonRpc, net.xtzktApi].some((base) => url.startsWith(base))) {
      return net.name;
    }
  }
  return undefined;
}

/** Relative path (posix separators) a request is stored at. Pure, so tests can assert on it. */
export function fixtureRelPath(req: ProviderRequest): string {
  const net = networkForUrl(req.url);
  if (!net) return `other/${shortHash(requestKey(req))}.json`;
  const cfg = NETWORKS[net];
  if (req.kind === "rpc") {
    const [first, ...rest] = req.params;
    const label =
      typeof first === "string" ? sanitize(first) : shortHash(JSON.stringify(req.params));
    const suffix = rest.length ? `.${shortHash(JSON.stringify(rest))}` : "";
    return `${net}/evm/${sanitize(req.method)}.${label}${suffix}.json`;
  }
  const u = new URL(req.url);
  if (req.url.startsWith(cfg.xtzktApi)) {
    const path = u.pathname.replace(/^\/v1\//, "");
    return `${net}/xtzkt/${sanitize(path + u.search)}.json`;
  }
  const path = u.pathname.replace(/^\/chains\/main\//, "");
  return `${net}/tezos/${sanitize(path + u.search)}.json`;
}

export class FileFixtureStore implements FixtureStore {
  constructor(readonly root: string) {}

  pathFor(req: ProviderRequest): string {
    return join(this.root, ...fixtureRelPath(req).split("/"));
  }

  async get(req: ProviderRequest): Promise<StoredResponse | undefined> {
    const p = this.pathFor(req);
    let text: string;
    try {
      text = await readFile(p, "utf8");
    } catch {
      return undefined;
    }
    let meta: Partial<StoredResponse> = {};
    try {
      meta = JSON.parse(await readFile(metaPath(p), "utf8")) as Partial<StoredResponse>;
    } catch {
      /* no sidecar: assume 200 */
    }
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* raw text fixture */
    }
    return { status: meta.status ?? 200, body, fetchedAt: meta.fetchedAt ?? "", ...{} };
  }

  async set(req: ProviderRequest, res: StoredResponse): Promise<void> {
    const p = this.pathFor(req);
    await mkdir(dirname(p), { recursive: true });
    const text = typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2);
    await writeFile(p, text + "\n");
    const meta = {
      key: requestKey(req),
      url: req.url,
      ...(req.kind === "rpc" ? { method: req.method, params: req.params } : {}),
      status: res.status,
      fetchedAt: res.fetchedAt,
    };
    await writeFile(metaPath(p), JSON.stringify(meta, null, 2) + "\n");
  }
}

function metaPath(p: string): string {
  return p.replace(/\.json$/, ".meta.json");
}

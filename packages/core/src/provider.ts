// Single choke point for every network call (SPEC §5): in-memory cache keyed by the request,
// plus record / replay through a pluggable FixtureStore so unit tests never touch the network.
// Browser-safe: depends only on `fetch`.

export type ProviderRequest =
  { kind: "get"; url: string } | { kind: "rpc"; url: string; method: string; params: unknown[] };

/** What a request produced, verbatim. `body` is the parsed JSON, or the raw text if not JSON. */
export interface StoredResponse {
  status: number;
  body: unknown;
  fetchedAt: string;
}

export interface FixtureStore {
  get(req: ProviderRequest): Promise<StoredResponse | undefined>;
  set(req: ProviderRequest, res: StoredResponse): Promise<void>;
}

export type ProviderMode = "live" | "record" | "replay";

export interface ProviderOptions {
  mode?: ProviderMode;
  store?: FixtureStore;
  fetch?: typeof fetch;
  /** Optional hook, called once per request that actually runs (not for cache hits). */
  onRequest?: (req: ProviderRequest) => void;
}

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface RpcResponse {
  result?: unknown;
  error?: RpcError;
  [key: string]: unknown;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly req: ProviderRequest,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Stable identity of a request, used for the cache and by stores. */
export function requestKey(req: ProviderRequest): string {
  return req.kind === "get"
    ? `GET ${req.url}`
    : `RPC ${req.url} ${req.method} ${JSON.stringify(req.params)}`;
}

export class Provider {
  readonly mode: ProviderMode;
  /** Every distinct request this provider served (for `trace.meta.sources`). */
  readonly sources: ProviderRequest[] = [];
  private readonly cache = new Map<string, Promise<StoredResponse>>();
  private readonly store: FixtureStore | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly onRequest: ((req: ProviderRequest) => void) | undefined;

  constructor(opts: ProviderOptions = {}) {
    this.mode = opts.mode ?? "live";
    this.store = opts.store;
    // Browsers throw "Illegal invocation" when window.fetch is called with another `this`
    // (as `this.fetchImpl(...)` would do). Wrap it so the call always goes through globalThis.
    this.fetchImpl = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.onRequest = opts.onRequest;
    if (this.mode !== "live" && !this.store) {
      throw new Error(`Provider mode "${this.mode}" needs a FixtureStore`);
    }
  }

  /** HTTP GET. Throws ProviderError on non-2xx. */
  async get(url: string): Promise<StoredResponse> {
    const req: ProviderRequest = { kind: "get", url };
    const res = await this.run(req);
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError(`GET ${url} -> ${res.status}`, req, res.status);
    }
    return res;
  }

  /** GET and return the parsed JSON body. */
  async getJson<T = unknown>(url: string): Promise<T> {
    return (await this.get(url)).body as T;
  }

  /** JSON-RPC call. Returns the full envelope; callers decide what an `error` means. */
  async rpc(url: string, method: string, params: unknown[]): Promise<RpcResponse> {
    const req: ProviderRequest = { kind: "rpc", url, method, params };
    const res = await this.run(req);
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError(`${method} -> HTTP ${res.status}`, req, res.status);
    }
    const body = res.body;
    if (!body || typeof body !== "object") {
      throw new ProviderError(`${method}: non-JSON response`, req, res.status);
    }
    return body as RpcResponse;
  }

  private run(req: ProviderRequest): Promise<StoredResponse> {
    const key = requestKey(req);
    let p = this.cache.get(key);
    if (!p) {
      this.sources.push(req);
      p = this.execute(req);
      this.cache.set(key, p);
      // Do not cache failures.
      p.catch(() => this.cache.delete(key));
    }
    return p;
  }

  private async execute(req: ProviderRequest): Promise<StoredResponse> {
    if (this.mode === "replay") {
      const hit = await this.store!.get(req);
      if (!hit) throw new ProviderError(`no fixture for ${requestKey(req)}`, req);
      return hit;
    }
    this.onRequest?.(req);
    const res = await this.doFetch(req);
    if (this.mode === "record") await this.store!.set(req, res);
    return res;
  }

  private async doFetch(req: ProviderRequest): Promise<StoredResponse> {
    const init: RequestInit =
      req.kind === "get"
        ? { method: "GET", headers: { accept: "application/json" } }
        : {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: req.method, params: req.params }),
          };
    let r: Response;
    try {
      r = await this.fetchImpl(req.url, init);
    } catch (e) {
      throw new ProviderError(`${requestKey(req)}: ${(e as Error).message}`, req);
    }
    const text = await r.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { status: r.status, body, fetchedAt: new Date().toISOString() };
  }
}

/** Trivial store for tests and for the widget (no filesystem). */
export class MemoryFixtureStore implements FixtureStore {
  readonly entries = new Map<string, StoredResponse>();
  async get(req: ProviderRequest): Promise<StoredResponse | undefined> {
    return this.entries.get(requestKey(req));
  }
  async set(req: ProviderRequest, res: StoredResponse): Promise<void> {
    this.entries.set(requestKey(req), res);
  }
}

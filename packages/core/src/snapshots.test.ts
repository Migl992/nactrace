// Every hash in fixtures/hashes.json must build offline and match its snapshot under
// fixtures/traces/<network>/<hash>.json (created on first run, refreshed with UPDATE_TRACES=1).
// The nightly job runs the same hashes live and diffs against these files.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { NetworkName } from "./networks.js";
import { replayProvider } from "./test-utils/replay.js";
import { buildTrace } from "./trace.js";
import type { Trace } from "./types.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const hashes = JSON.parse(readFileSync(join(ROOT, "fixtures/hashes.json"), "utf8")) as Record<
  NetworkName,
  { hash: string; label: string; level?: number }[]
>;

function stable(trace: Trace) {
  const meta: Partial<Trace["meta"]> = { ...trace.meta };
  delete meta.fetchedAt;
  delete meta.xtzktSchemaObservedAt;
  return { ...trace, meta };
}

for (const [network, list] of Object.entries(hashes) as [NetworkName, typeof hashes.previewnet][]) {
  describe(`snapshots: ${network}`, () => {
    for (const { hash, label, level } of list) {
      it(`${hash.slice(0, 14)}… ${label}`, async () => {
        const provider = replayProvider();
        let trace: Trace;
        try {
          trace = await buildTrace(hash, { provider, ...(level ? { level } : {}) });
        } catch (e) {
          if (!String((e as Error).message).includes("0xTzKT does not know")) throw e;
          trace = await buildTrace(hash, {
            provider,
            network,
            useXtzkt: false,
            ...(level ? { level } : {}),
          });
        }
        expect(trace.network).toBe(network);
        expect(trace.explanation.summary.length).toBeGreaterThan(20);
        const file = join(ROOT, "fixtures/traces", network, `${hash}.json`);
        const now = stable(trace);
        if (process.env["UPDATE_TRACES"] || !existsSync(file)) {
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, JSON.stringify(now, null, 2) + "\n");
          return;
        }
        expect(now).toEqual(JSON.parse(readFileSync(file, "utf8")));
      });
    }
  });
}

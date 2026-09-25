#!/usr/bin/env node
// Library end-to-end: use @nactrace/core from its built dist exactly like a consumer would.
// 1) live buildTrace in record mode into a temp dir, 2) replay from that dir with the network
// switched off, 3) both traces must agree. Usage: node scripts/e2e-library.mjs <dir> [hash]
import { Provider, buildTrace } from "../packages/core/dist/index.js";
import { FileFixtureStore } from "../packages/core/dist/node.js";

const dir = process.argv[2] ?? ".nactrace-record";
const hash =
  process.argv[3] ?? "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716";
const stable = (t) =>
  JSON.stringify({ ...t, meta: { ...t.meta, fetchedAt: 0, xtzktSchemaObservedAt: 0 } });

const rec = new Provider({ mode: "record", store: new FileFixtureStore(dir) });
const live = await buildTrace(hash, { provider: rec });
console.log(
  "live   :",
  live.network,
  live.status,
  live.meta.source,
  `${live.meta.sources.length} requests`,
);
console.log("         ", live.explanation.summary);

const noNet = () => {
  throw new Error("network use in replay");
};
const rep = new Provider({ mode: "replay", store: new FileFixtureStore(dir), fetch: noNet });
const replayed = await buildTrace(hash, { provider: rep });
console.log(
  "replay :",
  replayed.network,
  replayed.status,
  replayed.meta.source,
  `${replayed.meta.sources.length} requests`,
);
console.log("equal  :", stable(live) === stable(replayed));
if (stable(live) !== stable(replayed)) process.exit(1);

#!/usr/bin/env node
// Prints status, warnings and the explanation for every pinned hash, replayed from fixtures/raw.
// Use it to eyeball explain() output after changing the trace builder or re-recording.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Provider, buildTrace } from "../packages/core/dist/index.js";
import { FileFixtureStore } from "../packages/core/dist/node.js";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const hashes = JSON.parse(readFileSync(join(root, "fixtures/hashes.json"), "utf8"));
const only = process.argv[2];
for (const [net, list] of Object.entries(hashes)) {
  for (const { hash, label, level } of list) {
    if (only && !hash.startsWith(only)) continue;
    const provider = new Provider({
      mode: "replay",
      store: new FileFixtureStore(join(root, "fixtures/raw")),
    });
    try {
      let t;
      try {
        t = await buildTrace(hash, { provider, ...(level ? { level } : {}) });
      } catch (e) {
        if (!String(e.message).includes("0xTzKT does not know")) throw e;
        t = await buildTrace(hash, {
          provider,
          network: net,
          useXtzkt: false,
          ...(level ? { level } : {}),
        });
      }
      console.log(
        `\n[${net}] ${hash}\n  ${label}\n  status=${t.status} atomic=${t.atomic} source=${t.meta.source} nodes=${countNodes(t.root)}`,
      );
      console.log(`  WHY: ${t.explanation.summary}`);
      for (const w of t.meta.warnings) console.log(`  warn: ${w}`);
    } catch (e) {
      console.log(`\n[${net}] ${hash}\n  ${label}\n  ERROR: ${e.message}`);
    }
  }
}
function countNodes(n) {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

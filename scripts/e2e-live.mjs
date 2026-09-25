#!/usr/bin/env node
// Live end-to-end check (the nightly job's core): run the built CLI against the real networks for
// every hash in fixtures/hashes.json and compare status / explanation / node kinds with the
// recorded snapshots under fixtures/traces. Never used by unit tests.
// Usage: node scripts/e2e-live.mjs [--network previewnet|mainnet]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const cli = join(root, "packages/cli/dist/index.js");
const hashes = JSON.parse(readFileSync(join(root, "fixtures/hashes.json"), "utf8"));
const arg = process.argv.indexOf("--network");
const only = arg > 0 ? process.argv[arg + 1] : undefined;

const kinds = (n) => [n.kind, ...n.children.flatMap(kinds)];
let pass = 0;
let fail = 0;
for (const [net, list] of Object.entries(hashes)) {
  if (only && net !== only) continue;
  for (const { hash, label, level } of list) {
    const args = [
      cli,
      "--json",
      "--network",
      net,
      ...(level ? ["--level", String(level)] : []),
      hash,
    ];
    const t0 = Date.now();
    const r = spawnSync(process.execPath, args, {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    const ms = Date.now() - t0;
    if (r.status === 2) {
      fail++;
      console.log(`FAIL  [${net}] ${hash}  exit 2: ${r.stderr.trim().slice(0, 200)}`);
      continue;
    }
    const live = JSON.parse(r.stdout);
    const snapPath = join(root, "fixtures/traces", net, `${hash}.json`);
    const snap = existsSync(snapPath) ? JSON.parse(readFileSync(snapPath, "utf8")) : undefined;
    const diffs = [];
    if (snap) {
      if (live.status !== snap.status) diffs.push(`status ${snap.status} -> ${live.status}`);
      if (live.explanation.summary !== snap.explanation.summary)
        diffs.push(
          `summary changed:\n      was: ${snap.explanation.summary}\n      now: ${live.explanation.summary}`,
        );
      const a = kinds(snap.root).join(">");
      const b = kinds(live.root).join(">");
      if (a !== b) diffs.push(`tree ${a} -> ${b}`);
      const expectedExit = snap.status === "success" ? 0 : 1;
      if (r.status !== expectedExit) diffs.push(`exit ${r.status} (expected ${expectedExit})`);
    }
    const src =
      live.meta.source +
      (live.meta.warnings.length ? ` +${live.meta.warnings.length} warning(s)` : "");
    if (diffs.length) {
      fail++;
      console.log(
        `DIFF  [${net}] ${hash}  ${ms}ms  ${src}\n      ${label}\n      ${diffs.join("\n      ")}`,
      );
    } else {
      pass++;
      console.log(
        `ok    [${net}] ${hash.slice(0, 14)}…  ${String(ms).padStart(5)}ms  ${live.status.padEnd(16)} ${src}${snap ? "" : "  (no snapshot)"}`,
      );
    }
  }
}
console.log(`\n${pass} ok, ${fail} failing`);
process.exit(fail ? 1 : 0);

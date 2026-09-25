#!/usr/bin/env node
// nactrace-foundry: explain failed transactions of a Foundry broadcast (or any hashes you pass).
//
//   forge script script/Deploy.s.sol --rpc-url $PREVIEWNET --broadcast ; nactrace-foundry
//   nactrace-foundry --broadcast broadcast/Deploy.s.sol/128064/run-latest.json
//   forge test -vvvv 2>&1 | nactrace-foundry --stdin      # any hash printed by a test
//   nactrace-foundry 0x… oo…                               # explicit hashes
//
// Note: `forge test` against a fork never lands transactions on chain, so there is no hash to
// explain; use --broadcast runs or print hashes from your tests.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  broadcastChainId,
  broadcastTransactions,
  extractHashes,
  networkForChainId,
  runNactrace,
} from "./index.js";

const HELP = `nactrace-foundry [hashes...] [options] [-- nactrace options]

  --broadcast <path>  run-latest.json, or a directory searched recursively (default: ./broadcast)
  --all               explain every broadcast tx, not only the failed ones
  --stdin             also read hashes from stdin (pipe forge output into it)
  --network <name>    forwarded to nactrace
  -h, --help
`;

function findRunLatest(path: string): string[] {
  let st;
  try {
    st = statSync(path);
  } catch {
    return [];
  }
  if (st.isFile()) return [path];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    const p = join(path, entry);
    if (statSync(p).isDirectory()) out.push(...findRunLatest(p));
    else if (entry === "run-latest.json") out.push(p);
  }
  return out;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const dashDash = argv.indexOf("--");
  const own = dashDash >= 0 ? argv.slice(0, dashDash) : argv;
  const passthrough = dashDash >= 0 ? argv.slice(dashDash + 1) : [];
  const { values, positionals } = parseArgs({
    args: own,
    allowPositionals: true,
    options: {
      broadcast: { type: "string" },
      all: { type: "boolean", default: false },
      stdin: { type: "boolean", default: false },
      network: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values["help"]) {
    process.stdout.write(HELP);
    return 0;
  }

  const hashes = new Set<string>(positionals.flatMap(extractHashes));
  let network = values["network"] ? String(values["network"]) : undefined;
  if (values["stdin"]) for (const h of extractHashes(await readStdin())) hashes.add(h);

  const explicitBroadcast = typeof values["broadcast"] === "string";
  if (explicitBroadcast || (hashes.size === 0 && !values["stdin"])) {
    const files = findRunLatest(String(values["broadcast"] ?? "broadcast"));
    if (explicitBroadcast && files.length === 0) {
      process.stderr.write(
        `nactrace-foundry: no run-latest.json under ${String(values["broadcast"])}\n`,
      );
      return 2;
    }
    for (const f of files) {
      const broadcast = JSON.parse(readFileSync(f, "utf8")) as unknown;
      // The broadcast file knows its chain id: use it unless --network was given.
      network ??= networkForChainId(broadcastChainId(broadcast) ?? 0);
      const txs = broadcastTransactions(broadcast, !values["all"]);
      for (const t of txs) {
        process.stderr.write(
          `nactrace-foundry: ${f}: ${t.contractName ?? "?"}.${t.function ?? "?"} ${t.hash} status=${t.status ?? "?"}\n`,
        );
        hashes.add(t.hash);
      }
    }
  }

  if (hashes.size === 0) {
    process.stderr.write(
      "nactrace-foundry: nothing to explain (no failed broadcast tx, no hashes given)\n",
    );
    return 0;
  }
  let worst = 0;
  const extra = [...passthrough, ...(network ? ["--network", network] : [])];
  for (const h of hashes) {
    process.stdout.write(`\n=== ${h}\n`);
    const { code } = runNactrace([h, ...extra]);
    worst = Math.max(worst, code);
  }
  return worst;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`nactrace-foundry: ${(e as Error).message}\n`);
    process.exit(2);
  },
);

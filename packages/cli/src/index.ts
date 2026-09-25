#!/usr/bin/env node
// nactrace <hash|url> — explains a cross-interface call on Etherlink / Tezos X.
import { parseArgs } from "node:util";
import { buildTrace, NETWORKS, Provider, type NetworkName } from "@nactrace/core";
import { FileFixtureStore } from "@nactrace/core/node";
import { exitCodeFor, renderTree } from "./render.js";

const HELP = `nactrace <hash|explorer-url> [options]

Explains what a cross-interface (NAC) transaction did on Etherlink / Tezos X and why it failed.
Accepts an EVM tx hash, a Tezos operation hash, or a Blockscout / TzKT / 0xTzKT URL.

Options
  -n, --network <name>   previewnet | mainnet | shadownet (default: auto-detect via 0xTzKT)
  -j, --json             print the full Trace JSON instead of the tree
  -e, --explain-only     print only the one-sentence explanation
      --rpc-only         skip 0xTzKT and rebuild from RPC alone (needs --network)
      --no-enrich        0xTzKT skeleton only, no RPC calls
      --level <n>        block level of the operation (RPC-only path for an op hash without EVM leg)
      --record <dir>     save every response under <dir> (fixture recording)
      --replay <dir>     answer every request from <dir>, never touch the network
  -v, --verbose          do not trim long error strings
      --no-color         disable ANSI colors
  -h, --help             show this help

Exit codes: 0 success, 1 the transaction reverted or a leg was caught, 2 usage or lookup error.
`;

function fail(msg: string, code = 2): never {
  process.stderr.write(`nactrace: ${msg}\n`);
  process.exit(code);
}

async function main(): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      allowNegative: true,
      options: {
        network: { type: "string", short: "n" },
        json: { type: "boolean", short: "j", default: false },
        "explain-only": { type: "boolean", short: "e", default: false },
        "rpc-only": { type: "boolean", default: false },
        enrich: { type: "boolean", default: true },
        level: { type: "string" },
        record: { type: "string" },
        replay: { type: "string" },
        verbose: { type: "boolean", short: "v", default: false },
        color: { type: "boolean", default: true },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    fail((e as Error).message);
  }
  const { values, positionals } = parsed;
  if (values["help"]) {
    process.stdout.write(HELP);
    return 0;
  }
  const input = positionals[0];
  if (!input) {
    process.stdout.write(HELP);
    return 2;
  }
  const network = values["network"] as string | undefined;
  if (network && !(network in NETWORKS)) fail(`unknown network "${network}"`);
  if (values["record"] && values["replay"]) fail("--record and --replay are mutually exclusive");

  const provider = values["replay"]
    ? new Provider({ mode: "replay", store: new FileFixtureStore(String(values["replay"])) })
    : values["record"]
      ? new Provider({ mode: "record", store: new FileFixtureStore(String(values["record"])) })
      : new Provider();

  let trace;
  try {
    trace = await buildTrace(input, {
      provider,
      ...(network ? { network: network as NetworkName } : {}),
      useXtzkt: !values["rpc-only"],
      ...(values["level"] ? { level: Number(values["level"]) } : {}),
      enrich: values["enrich"] !== false,
    });
  } catch (e) {
    fail((e as Error).message);
  }

  if (values["json"]) {
    process.stdout.write(JSON.stringify(trace, null, 2) + "\n");
  } else if (values["explain-only"]) {
    process.stdout.write(trace.explanation.summary + "\n");
  } else {
    const color =
      values["color"] !== false && process.stdout.isTTY === true && !process.env["NO_COLOR"];
    process.stdout.write(renderTree(trace, { color, verbose: values["verbose"] === true }) + "\n");
  }
  return exitCodeFor(trace);
}

main().then(
  (code) => process.exit(code),
  (e) => fail((e as Error).stack ?? String(e)),
);

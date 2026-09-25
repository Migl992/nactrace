// End-to-end tests of the built CLI binary (packages/cli/dist/index.js) in replay mode: arguments,
// exit codes, output modes. `pnpm build` must have run; the suite skips itself otherwise.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const RAW = fileURLToPath(new URL("../../../fixtures/raw", import.meta.url));
const REVERT = "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716";
const OK = "0x9480b2b38d6b1389cf553603bd81c3796c57e66b669b11f1bb0b00bc5b858bb1";
const PLAIN_FAIL = "ooY5Aihm9QBkvC92ZD6Ex2pcoDHJBSw6xpzDftHULELWQKk1br8";

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe.skipIf(!existsSync(CLI))(
  "nactrace CLI (built binary, replay)",
  { timeout: 30_000 },
  () => {
    it("prints help and exits 0 / 2", () => {
      expect(run("--help")).toMatchObject({ code: 0 });
      expect(run("--help").out).toContain("nactrace <hash|explorer-url>");
      const noArgs = run();
      expect(noArgs.code).toBe(2);
      expect(noArgs.out).toContain("Options");
    });

    it("exit 1 on a revert, tree on stdout", () => {
      const r = run("--replay", RAW, REVERT);
      expect(r.code).toBe(1);
      expect(r.out).toContain("REVERTED (atomic, both sides rolled back)");
      expect(r.out).toContain("Why: EVM tx 0x3977…f716");
      expect(r.err).toBe("");
    });

    it("exit 0 on success; --explain-only prints one line; --json prints a Trace", () => {
      expect(run("--replay", RAW, OK).code).toBe(0);
      const e = run("--replay", RAW, "--explain-only", OK);
      expect(e.code).toBe(0);
      expect(e.out.trim().split("\n")).toHaveLength(1);
      expect(e.out).toMatch(/^EVM tx 0x9480…8bb1 .* all 1 leg applied\.\n$/);
      const j = run("--replay", RAW, "--json", OK);
      const trace = JSON.parse(j.out) as {
        schemaVersion: string;
        status: string;
        meta: { source: string };
      };
      expect(trace.schemaVersion).toBe("1");
      expect(trace.status).toBe("success");
      expect(trace.meta.source).toBe("xtzkt+rpc");
    });

    it("--rpc-only with --network and --level for an op without EVM leg", () => {
      const r = run(
        "--replay",
        RAW,
        "--rpc-only",
        "--network",
        "previewnet",
        "--level",
        "1047288",
        PLAIN_FAIL,
        "-e",
      );
      expect(r.code).toBe(1);
      expect(r.out).toContain('reverted: FAILWITH "at zero"; no cross-runtime leg failed.');
    });

    it("usage errors exit 2 with a message on stderr", () => {
      expect(run("--replay", RAW, "--network", "goerli", OK)).toMatchObject({ code: 2 });
      expect(run("--replay", RAW, "--network", "goerli", OK).err).toContain(
        'unknown network "goerli"',
      );
      expect(run("--replay", RAW, "--record", RAW, OK).err).toContain("mutually exclusive");
      expect(run("--replay", RAW, "not-a-hash").err).toContain("not a transaction hash");
      expect(run("--bogus-flag", OK).code).toBe(2);
    });

    it("unknown hash in replay: exit 2 and a hint about --network", () => {
      const r = run("--replay", RAW, "0x" + "11".repeat(32));
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/does not know|no fixture/);
    });

    it("explorer URLs are accepted", () => {
      const r = run(
        "--replay",
        RAW,
        "-e",
        `https://blockscout.previewnet.tezosx.nomadic-labs.com/tx/${OK}`,
      );
      expect(r.code).toBe(0);
      expect(r.out).toContain("crossed into Michelson %increment");
    });

    it("--verbose keeps long errors whole; default trims them", () => {
      const short = run("--replay", RAW, REVERT).out;
      const long = run("--replay", RAW, "--verbose", REVERT).out;
      expect(short).toContain("…");
      expect(long).toContain('failed with: String("at zero") of type String');
    });
  },
);

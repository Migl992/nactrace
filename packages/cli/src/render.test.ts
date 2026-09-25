import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Trace } from "@nactrace/core";
import { describe, expect, it } from "vitest";
import { exitCodeFor, renderTree } from "./render.js";

const TRACES = fileURLToPath(new URL("../../../fixtures/traces/", import.meta.url));
const load = (net: string, hash: string): Trace =>
  JSON.parse(readFileSync(`${TRACES}${net}/${hash}.json`, "utf8")) as Trace;

const REVERT = "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716";
const NESTED = "oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W";
const VIEW = "0x35ff4be8197f643b5243eecbe00459c18b58558a306a716bbf60b498acba7e50";

describe("renderTree", () => {
  it("renders the atomic revert with both reasons and the storage diff", () => {
    const t = load("previewnet", REVERT);
    const out = renderTree(t);
    expect(out).toContain("REVERTED (atomic, both sides rolled back)");
    expect(out).toContain("evm tx 0x3977…f716 0x2cad…87b3 → 0x0e11…4b3d 0x2baeceb7");
    expect(out).toContain("└─ ↘ michelson crossing 0x0e11…4b3d → KT1LT…5Tgv %decrement");
    expect(out).toContain("[30237 gas] mirrored opEnk…mSry");
    expect(out).toContain('michelson: Transfer(MichelsonContractInterpretError("runtime failure');
    expect(out).toContain('storage: {"int":"0"} → {"int":"0"}');
    expect(out).toContain("Why: EVM tx 0x3977…f716");
    expect(out).toContain("EVM reason: Cross-runtime call failed with status 400 Bad Request");
    expect(exitCodeFor(t)).toBe(1);
  });

  it("renders a nested Michelson -> EVM -> Michelson success with proper tree lines", () => {
    const t = load("previewnet", NESTED);
    const out = renderTree(t);
    expect(out).toContain("SUCCESS");
    expect(out).toContain("michelson op oo3MF…E16W tz1Tj…A3Mh → KT18o…qsPw (gateway) %call_evm");
    expect(out).toMatch(/└─ ↘ evm crossing tz1Tj…A3Mh → 0x0e11…4b3d increment\(\)/);
    expect(out).toContain("\n   └─ ↘ michelson crossing 0x0e11…4b3d → KT1LT…5Tgv %increment");
    expect(out).toContain("event: CrossRuntimeCallReceived id=0-0");
    expect(out).toContain("event: CrossRuntimeCallSent id=0-0");
    expect(exitCodeFor(t)).toBe(0);
  });

  it("renders a view with its decoded return value", () => {
    const out = renderTree(load("previewnet", VIEW));
    expect(out).toContain("👁 michelson view 0x5dae…2dd7 → KT1LT…5Tgv get_counter");
    expect(out).toContain("returned: 0x0001");
  });

  it("emits ANSI codes only when asked", () => {
    const t = load("previewnet", VIEW);
    expect(renderTree(t)).not.toContain("\u001b[");
    expect(renderTree(t, { color: true })).toContain("\u001b[");
  });
});

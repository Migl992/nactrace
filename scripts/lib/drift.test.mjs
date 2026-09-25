import { describe, expect, it } from "vitest";
import {
  fieldPaths,
  openapiDiff,
  openapiKeys,
  renderReport,
  rowFieldPaths,
  setDiff,
} from "./drift.mjs";

describe("drift helpers", () => {
  it("extracts dotted field paths with arrays flattened", () => {
    expect(fieldPaths({ a: 1, b: { c: [{ d: 2 }, { e: 3 }] }, f: [1, 2] })).toEqual([
      "a",
      "b",
      "b.c",
      "b.c[].d",
      "b.c[].e",
      "f",
    ]);
    expect(rowFieldPaths([{ x: 1 }, { y: { z: 1 } }])).toEqual(["x", "y", "y.z"]);
  });

  it("diffs OpenAPI paths, schema properties, anyOf refs and discriminators", () => {
    const before = {
      paths: { "/v1/a": {}, "/v1/b": {} },
      components: {
        schemas: {
          Row: { properties: { hash: {}, level: {} } },
          Union: {
            anyOf: [{ $ref: "#/components/schemas/Row" }],
            discriminator: { mapping: { x_evm: "#/components/schemas/Row" } },
          },
        },
      },
    };
    const after = structuredClone(before);
    after.paths["/v1/c"] = {};
    delete after.paths["/v1/b"];
    after.components.schemas.Row.properties.gasRefund = {};
    after.components.schemas.Union.discriminator.mapping.x_new = "#/components/schemas/Row";
    expect(openapiKeys(before)).toContain("schema Union discriminator x_evm -> Row");
    expect(openapiDiff(before, after)).toEqual({
      added: ["path /v1/c", "schema Row.gasRefund", "schema Union discriminator x_new -> Row"],
      removed: ["path /v1/b"],
    });
    expect(setDiff(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
  });

  it("renders a green report and a red one", () => {
    const base = {
      date: "2026-09-26",
      versions: { previewnet: "octez-evm-node 0.65" },
      traces: { pass: 32, fail: 0, output: "" },
      openapi: { previewnet: { added: [], removed: [], count: 10 } },
      fields: { previewnet: { added: [], removed: ["nonce"], count: 100 } },
    };
    const green = renderReport(base);
    expect(green.ok).toBe(true);
    expect(green.markdown).toContain("**No drift.**");
    expect(green.markdown).toContain("(not seen) nonce");

    const red = renderReport({
      ...base,
      traces: { pass: 31, fail: 1, output: "DIFF [previewnet] 0xabc summary changed" },
      openapi: { previewnet: { added: ["path /v1/new"], removed: [], count: 11 } },
      fields: { previewnet: { added: ["brandNew"], removed: [], count: 101 } },
    });
    expect(red.ok).toBe(false);
    expect(red.markdown).toContain("+ path /v1/new");
    expect(red.markdown).toContain("+ brandNew");
    expect(red.markdown).toContain("summary changed");
    expect(red.markdown).toContain("**Drift detected.**");

    const broken = renderReport({ ...base, openapi: { previewnet: { error: "ECONNREFUSED" } } });
    expect(broken.ok).toBe(false);
    expect(broken.markdown).toContain("could not fetch");
  });
});

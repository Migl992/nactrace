#!/usr/bin/env node
// Generates packages/core/src/xtzkt.types.ts from every recorded 0xTzKT transaction fixture
// (fixtures/raw/<network>/xtzkt/operations_transaction_*.json). Types are what was OBSERVED,
// every field optional, index signatures everywhere, so additive schema changes never break
// parsing (CLAUDE.md rule 3). Re-run after `pnpm fixtures:record`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const rawRoot = join(root, "fixtures/raw");

const rows = [];
const sourcesSeen = [];
for (const net of readdirSync(rawRoot)) {
  const dir = join(rawRoot, net, "xtzkt");
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    continue;
  }
  for (const f of files) {
    if (!f.startsWith("operations_transaction_") || f.endsWith(".meta.json")) continue;
    const body = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (!Array.isArray(body)) continue;
    rows.push(...body);
    sourcesSeen.push(`${net}/xtzkt/${f}`);
  }
}
if (rows.length === 0)
  throw new Error("no 0xTzKT transaction fixtures found; run pnpm fixtures:record first");

// ---- shape inference -------------------------------------------------------------------------
function kindOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // string | number | boolean | object
}

/** Collect per-path: set of scalar kinds, nested object shape, array element shape, directions seen. */
function collect(shape, value, direction) {
  const k = kindOf(value);
  shape.kinds.add(k);
  shape.count += 1;
  if (direction) shape.directions.add(direction);
  if (k === "object") {
    shape.object ??= new Map();
    for (const [key, v] of Object.entries(value)) {
      if (!shape.object.has(key)) shape.object.set(key, newShape());
      collect(shape.object.get(key), v, direction);
    }
  } else if (k === "array") {
    shape.array ??= newShape();
    for (const v of value) collect(shape.array, v, direction);
  } else if (k === "string" && shape.examples.size < 3) {
    shape.examples.add(value.length > 40 ? value.slice(0, 40) + "…" : value);
  }
}
function newShape() {
  return { kinds: new Set(), count: 0, directions: new Set(), examples: new Set() };
}

const rootShape = newShape();
for (const r of rows) collect(rootShape, r, r.direction);

// Named nested types when a shape is reused (account refs, chain).
const ACCOUNT_KEYS = ["sender", "target", "initiator", "alias", "gateway"];

function render(shape, indent, depth) {
  const parts = [];
  const scalar = [...shape.kinds].filter((k) => k !== "object" && k !== "array");
  for (const k of scalar) parts.push(k === "null" ? "null" : k);
  if (shape.kinds.has("array")) {
    parts.push(
      shape.array && depth < 3 ? `${render(shape.array, indent, depth + 1)}[]` : "unknown[]",
    );
  }
  if (shape.kinds.has("object")) {
    if (depth >= 3 || !shape.object) parts.push("Record<string, unknown>");
    else parts.push(renderObject(shape.object, indent, depth + 1));
  }
  return parts.length ? [...new Set(parts)].join(" | ") : "unknown";
}

function renderObject(map, indent, depth) {
  const pad = "  ".repeat(indent + 1);
  const lines = ["{"];
  for (const [key, s] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(
      `${pad}${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}?: ${render(s, indent + 1, depth)};`,
    );
  }
  lines.push(`${pad}[key: string]: unknown;`);
  lines.push(`${"  ".repeat(indent)}}`);
  return lines.join("\n");
}

const top = rootShape.object;
const lines = [];
lines.push(
  "// GENERATED FILE — do not edit. Produced by scripts/gen-xtzkt-types.mjs from recorded 0xTzKT",
);
lines.push(
  `// responses (${rows.length} rows across ${sourcesSeen.length} fixtures, generated ${new Date().toISOString().slice(0, 10)}).`,
);
lines.push(
  "// Every field is optional and every object carries an index signature: 0xTzKT is still adding",
);
lines.push("// fields (Baking Bad, 2026-09-25) and unknown fields must never break parsing.");
lines.push("");
lines.push("/** Account reference as it appears in sender/target/initiator/alias/gateway. */");
const accountShape = newShape();
for (const k of ACCOUNT_KEYS) {
  const s = top.get(k);
  if (s?.object)
    for (const [kk, v] of s.object) {
      if (!accountShape.object) accountShape.object = new Map();
      if (!accountShape.object.has(kk)) accountShape.object.set(kk, newShape());
      const t = accountShape.object.get(kk);
      for (const kind of v.kinds) t.kinds.add(kind);
    }
}
lines.push(`export interface XtzktAccountRef ${renderObject(accountShape.object, 0, 1)}`);
lines.push("");
lines.push("/** One leg of a transaction as returned by GET /v1/operations/transaction?hash=… */");
lines.push("export interface XtzktTransactionRowFields {");
for (const [key, s] of [...top.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const dirs = [...s.directions].sort().join(", ");
  const ex = [...s.examples].map((e) => JSON.stringify(e)).join(", ");
  lines.push(
    `  /** seen in ${s.count}/${rows.length} rows (${dirs})${ex ? `; e.g. ${ex}` : ""} */`,
  );
  const type = ACCOUNT_KEYS.includes(key) ? "XtzktAccountRef" : render(s, 1, 1);
  lines.push(`  ${key}?: ${type};`);
}
lines.push("}");
lines.push("");
lines.push(
  "export type XtzktTransactionRow = XtzktTransactionRowFields & { [key: string]: unknown };",
);
lines.push("");
lines.push(
  "/** Field paths observed when this file was generated (for the nightly schema diff). */",
);
const paths = [];
(function walk(map, prefix) {
  for (const [k, s] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const p = prefix ? `${prefix}.${k}` : k;
    paths.push(p);
    if (s.object) walk(s.object, p);
    if (s.array?.object) walk(s.array.object, `${p}[]`);
  }
})(top, "");
lines.push(
  `export const XTZKT_OBSERVED_FIELDS: readonly string[] = ${JSON.stringify(paths, null, 2)};`,
);
lines.push("");

const outPath = join(root, "packages/core/src/xtzkt.types.ts");
writeFileSync(outPath, lines.join("\n"));
console.log(
  `wrote ${outPath}: ${top.size} top-level fields, ${paths.length} paths, from ${rows.length} rows`,
);

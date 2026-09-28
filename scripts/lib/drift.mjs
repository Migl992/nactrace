// Pure helpers for the nightly drift check (no network): field-path extraction, OpenAPI and
// field-set diffs. Tested offline in scripts/lib/drift.test.mjs.

/** Dotted field paths of a JSON value; array elements are flattened under `path[]`. Sorted, unique. */
export function fieldPaths(value, prefix = "", out = new Set()) {
  if (Array.isArray(value)) {
    for (const v of value) fieldPaths(v, prefix ? `${prefix}[]` : "[]", out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const p = prefix && prefix !== "[]" ? `${prefix}.${k}` : k;
      out.add(p);
      fieldPaths(v, p, out);
    }
  }
  return [...out].sort();
}

/** Same convention as scripts/gen-xtzkt-types.mjs: top-level rows are not wrapped in `[]`. */
export function rowFieldPaths(rows) {
  const out = new Set();
  for (const r of rows) for (const p of fieldPaths(r)) out.add(p);
  return [...out].sort();
}

export function setDiff(before, after) {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: [...a].filter((x) => !b.has(x)).sort(),
    removed: [...b].filter((x) => !a.has(x)).sort(),
  };
}

/** Flatten an OpenAPI document to comparable keys: paths, and "Schema.property" pairs. */
export function openapiKeys(doc) {
  const keys = new Set();
  for (const p of Object.keys(doc?.paths ?? {})) keys.add(`path ${p}`);
  for (const [name, schema] of Object.entries(doc?.components?.schemas ?? {})) {
    keys.add(`schema ${name}`);
    for (const prop of Object.keys(schema?.properties ?? {})) keys.add(`schema ${name}.${prop}`);
    for (const alt of schema?.anyOf ?? schema?.oneOf ?? []) {
      if (alt?.$ref) keys.add(`schema ${name} -> ${alt.$ref.split("/").pop()}`);
    }
    for (const [disc, target] of Object.entries(schema?.discriminator?.mapping ?? {})) {
      keys.add(`schema ${name} discriminator ${disc} -> ${String(target).split("/").pop()}`);
    }
  }
  return [...keys].sort();
}

/** OpenAPI keys nactrace depends on: the transaction endpoint and every Transaction* schema. */
export function isRelevantOpenapiKey(key) {
  return /^path \/v1\/operations\/transaction\b|^schema [A-Za-z]*Transaction[A-Za-z]*\b/.test(key);
}

export function openapiDiff(before, after) {
  return setDiff(openapiKeys(before), openapiKeys(after));
}

/** Markdown report from the collected sections; `ok` is false when anything drifted or failed. */
export function renderReport({ date, versions, traces, openapi, fields }) {
  const lines = [`# nactrace nightly — ${date}`, ""];
  let ok = true;

  lines.push("## Node versions", "");
  for (const [net, v] of Object.entries(versions)) lines.push(`- ${net}: \`${v}\``);
  lines.push("");

  lines.push("## Live traces vs snapshots", "");
  lines.push(`${traces.pass} ok, ${traces.fail} failing`);
  if (traces.fail) {
    ok = false;
    lines.push("", "```", traces.output.trim(), "```");
  }
  lines.push("");

  lines.push("## 0xTzKT OpenAPI", "");
  for (const [net, d] of Object.entries(openapi)) {
    if (d.error) {
      ok = false;
      lines.push(`- ${net}: **could not fetch** (${d.error})`);
      continue;
    }
    if (!d.added.length && !d.removed.length) {
      lines.push(`- ${net}: unchanged (${d.count} keys)`);
      continue;
    }
    // Only what nactrace reads counts as drift: anything removed, or additions touching the
    // transaction endpoint / schemas. Other additions (new endpoints, profiles, …) are listed as
    // information so the recorded document can be refreshed at leisure.
    const relevantAdded = d.added.filter(isRelevantOpenapiKey);
    const otherAdded = d.added.filter((k) => !isRelevantOpenapiKey(k));
    if (d.removed.length || relevantAdded.length) ok = false;
    lines.push(
      `- ${net}: ${d.removed.length || relevantAdded.length ? "**" : ""}${relevantAdded.length} relevant added, ${d.removed.length} removed${d.removed.length || relevantAdded.length ? "**" : ""}, ${otherAdded.length} unrelated added`,
    );
    for (const k of relevantAdded) lines.push(`  - + ${k}`);
    for (const k of d.removed) lines.push(`  - - ${k}`);
    for (const k of otherAdded) lines.push(`  - (unrelated) + ${k}`);
  }
  lines.push("");

  lines.push("## 0xTzKT transaction fields (pinned hashes, live)", "");
  for (const [net, d] of Object.entries(fields)) {
    if (d.error) {
      ok = false;
      lines.push(`- ${net}: **could not fetch** (${d.error})`);
      continue;
    }
    if (!d.added.length && !d.removed.length) {
      lines.push(`- ${net}: unchanged (${d.count} paths)`);
      continue;
    }
    // Missing fields are only informational: they may just not occur in tonight's rows.
    if (d.added.length) ok = false;
    lines.push(
      `- ${net}: **${d.added.length} new field path(s)**, ${d.removed.length} not seen tonight`,
    );
    for (const k of d.added) lines.push(`  - + ${k}`);
    for (const k of d.removed) lines.push(`  - (not seen) ${k}`);
  }
  lines.push(
    "",
    ok
      ? "**No drift.**"
      : "**Drift detected.** Re-record fixtures with `pnpm fixtures:record` and review `docs/FINDINGS.md`.",
    "",
  );
  return { ok, markdown: lines.join("\n") };
}

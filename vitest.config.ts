import { defineConfig } from "vitest/config";

import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Tests import workspace packages from source, so nothing depends on a prior build.
    alias: {
      "@nactrace/core/node": fileURLToPath(new URL("./packages/core/src/node.ts", import.meta.url)),
      "@nactrace/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    // Unit tests must never touch the network (CLAUDE.md rule 4).
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**"],
    },
  },
});

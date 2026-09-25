import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    // Unit tests must never touch the network (CLAUDE.md rule 4).
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**"],
    },
  },
});

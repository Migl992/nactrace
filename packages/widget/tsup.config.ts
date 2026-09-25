import { defineConfig } from "tsup";

export default defineConfig({
  entry: { nactrace: "src/index.ts" },
  format: ["iife"],
  globalName: "nactrace",
  platform: "browser",
  target: "es2020",
  minify: true,
  sourcemap: true,
  clean: true,
  noExternal: [/.*/],
  outExtension: () => ({ js: ".js" }),
});

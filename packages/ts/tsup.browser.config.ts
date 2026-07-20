import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "browser/browser": "src/browser.ts" },
  format: ["esm"],
  platform: "browser",
  noExternal: [/.*/],
  dts: false,
  clean: false,
});

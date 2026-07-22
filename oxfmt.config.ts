import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    // `astryx theme build` output — regenerated from stoneTheme.ts, not
    // hand-edited (each file's own header says so).
    "src/themes/**/*.css",
    "src/themes/**/*.variants.d.ts",
    "src/themes/stone/stone.js",
    "src/themes/stone/stone.d.ts",
  ],
});

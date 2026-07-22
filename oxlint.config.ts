import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [
    ...core.ignorePatterns,
    // `astryx theme build` output — regenerated from stoneTheme.ts, not
    // hand-edited (each file's own header says so).
    "src/themes/**/*.css",
    "src/themes/**/*.variants.d.ts",
    "src/themes/stone/stone.js",
    "src/themes/stone/stone.d.ts",
  ],
  overrides: [
    {
      // Convex's own file-naming convention is camelCase (auth.ts,
      // staticHosting.ts, http.ts); functions are addressed by file path,
      // so renaming to kebab-case would also require re-wiring callers.
      files: ["convex/**"],
      rules: {
        "unicorn/filename-case": "off",
      },
    },
    {
      // Astryx-vendored theme source (`npx astryx theme add stone`, kept in
      // sync with `npx astryx theme build`) ships upstream's own filename
      // casing, key ordering, and per-value color-annotation comments.
      // Reformatting it to this repo's style would fight every future
      // `astryx theme build` / `astryx upgrade` regeneration.
      files: ["src/themes/**"],
      rules: {
        "jsdoc/check-tag-names": "off",
        "no-inline-comments": "off",
        "sort-keys": "off",
        "unicorn/filename-case": "off",
      },
    },
  ],
});

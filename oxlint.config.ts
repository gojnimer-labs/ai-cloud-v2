import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: core.ignorePatterns,
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
  ],
});

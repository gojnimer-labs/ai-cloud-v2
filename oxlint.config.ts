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
    {
      // toSorted() requires ES2023, which this repo doesn't target — plain
      // sort() is fine here since it's only ever called on a freshly
      // constructed array (map()'s output, or a fixture built inline in the
      // test itself), never on a caller-owned array whose mutation would be
      // observable.
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "unicorn/no-array-sort": "off",
      },
    },
  ],
});

import path from "node:path";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  // tanstackRouter must come before react() so it can generate routeTree.gen.ts
  plugins: [
    tanstackRouter({ autoCodeSplitting: true, target: "react" }),
    react(),
    paraglideVitePlugin({
      outdir: "./src/paraglide",
      project: "./project.inlang",
      // Cookie remembers an explicit choice (LocaleSwitcher); first-time
      // visitors fall back to their browser language, then to English.
      strategy: ["cookie", "preferredLanguage", "baseLocale"],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});

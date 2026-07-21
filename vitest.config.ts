import path from "node:path";

import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          test: {
            environment: "edge-runtime",
            include: ["convex/**/*.test.ts"],
            name: "convex",
            testTimeout: 15_000,
          },
        },
        {
          extends: true,
          optimizeDeps: {
            include: [
              "@astryxdesign/core",
              "@astryxdesign/core/AspectRatio",
              "@astryxdesign/core/Spinner",
              "@astryxdesign/core/theme",
              "@astryxdesign/theme-neutral",
              "@tanstack/react-router",
              "react-dom/client",
              "zod",
            ],
          },
          resolve: {
            // Array form (not a plain object) so these entries are checked
            // before vite.config.ts's own "@" alias when merged — vite's
            // mergeConfig otherwise appends new object keys after existing
            // ones, letting the "@" prefix match "@/shared/api/auth-client"
            // first and resolve to the real (network-calling) module instead.
            alias: [
              {
                find: "convex/react",
                replacement: path.resolve(
                  import.meta.dirname,
                  "./src/test/mocks/convex-react.tsx"
                ),
              },
              {
                find: "@/shared/api/auth-client",
                replacement: path.resolve(
                  import.meta.dirname,
                  "./src/test/mocks/auth-client.ts"
                ),
              },
            ],
          },
          test: {
            browser: {
              enabled: true,
              headless: true,
              instances: [{ browser: "chromium" }],
              provider: playwright(),
            },
            include: ["src/**/*.test.tsx"],
            name: "client",
            setupFiles: ["./src/test/setup.ts"],
          },
        },
      ],
    },
  })
);

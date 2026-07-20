/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("createCluster rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.operators.mutations.createCluster, {
      name: "test-cluster",
      retentionPolicy: "standard",
    })
  ).rejects.toThrow("Admin access required");
});

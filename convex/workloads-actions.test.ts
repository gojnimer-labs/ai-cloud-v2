/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// There was previously zero test coverage of the action-layer "must be
// logged in" check at all — this mirrors admin-mutations.test.ts's
// "rejects an unauthenticated caller" pattern for the customFunctions
// authedAction wrapper (see convex/functions.ts) instead.
test("listMyWorkloads rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.workloads.actions.listMyWorkloads, {})
  ).rejects.toThrow("Not authenticated");
});

/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("getCurrentUser returns null when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  const user = await t.query(api.auth.getCurrentUser);
  expect(user).toBeNull();
});

/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("send then list returns the message", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.messages.send, { author: "Sarah", body: "Hi!" });
  const messages = await t.query(api.messages.list);
  expect(messages).toMatchObject([{ author: "Sarah", body: "Hi!" }]);
});

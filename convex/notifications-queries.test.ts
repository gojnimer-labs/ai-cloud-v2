/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("listHistoryForAdmin rejects a non-admin caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.notifications.queries.listHistoryForAdmin, {})
  ).rejects.toThrow("Admin access required");
});

test("listHistoryForAdminInternal merges systemAlerts and notificationSends, newest first", async () => {
  const t = convexTest(schema, modules);
  const [alertId, sendId] = await t.run((ctx) =>
    Promise.all([
      ctx.db.insert("systemAlerts", {
        audience: "everyone",
        createdAt: 1000,
        createdBy: "admin_1",
        isActive: true,
        isDismissable: true,
        title: "Oldest — an alert",
        topic: "global",
        variant: "warning",
      }),
      ctx.db.insert("notificationSends", {
        createdAt: 2000,
        createdBy: "admin_1",
        recipientCount: 1,
        targetMode: "user",
        targetSummary: "user@example.com",
        title: "Newest — a send",
        variant: "info",
      }),
    ])
  );

  const rows = await t.query(
    internal.notifications.queries.listHistoryForAdminInternal,
    {}
  );

  expect(rows.map((row) => row._id)).toEqual([sendId, alertId]);
  expect(rows[0]).toMatchObject({
    kind: "send",
    recipientCount: 1,
    targetMode: "user",
    targetSummary: "user@example.com",
  });
  expect(rows[1]).toMatchObject({
    alertId,
    isActive: true,
    kind: "alert",
    topic: "global",
  });
});

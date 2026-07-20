/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("listActiveSystemAlertsForUserInternal excludes a retracted alert", async () => {
  const t = convexTest(schema, modules);
  const activeAlertId = await t.run((ctx) =>
    ctx.db.insert("systemAlerts", {
      createdAt: Date.now(),
      createdBy: "admin_1",
      isActive: true,
      isDismissable: true,
      title: "Still active",
      variant: "info",
    })
  );
  await t.run((ctx) =>
    ctx.db.insert("systemAlerts", {
      createdAt: Date.now(),
      createdBy: "admin_1",
      isActive: false,
      isDismissable: true,
      retractedAt: Date.now(),
      title: "Retracted",
      variant: "warning",
    })
  );

  const alerts = await t.query(
    internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
    { userId: "user_a" }
  );
  expect(alerts.map((alert) => alert._id)).toEqual([activeAlertId]);
});

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
      audience: "everyone",
      createdAt: Date.now(),
      createdBy: "admin_1",
      isActive: true,
      isDismissable: true,
      title: "Still active",
      topic: "global",
      variant: "info",
    })
  );
  await t.run((ctx) =>
    ctx.db.insert("systemAlerts", {
      audience: "everyone",
      createdAt: Date.now(),
      createdBy: "admin_1",
      isActive: false,
      isDismissable: true,
      retractedAt: Date.now(),
      title: "Retracted",
      topic: "global",
      variant: "warning",
    })
  );

  const alerts = await t.query(
    internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
    { isAdmin: false, topic: "global", userId: "user_a" }
  );
  expect(alerts.map((alert) => alert._id)).toEqual([activeAlertId]);
});

test("listActiveSystemAlertsForUserInternal only returns alerts matching the given topic", async () => {
  const t = convexTest(schema, modules);
  const globalAlertId = await t.run((ctx) =>
    ctx.db.insert("systemAlerts", {
      audience: "everyone",
      createdAt: Date.now(),
      createdBy: "admin_1",
      isActive: true,
      isDismissable: true,
      title: "Global notice",
      topic: "global",
      variant: "info",
    })
  );
  const fleetAlertId = await t.run((ctx) =>
    ctx.db.insert("systemAlerts", {
      audience: "admins",
      createdAt: Date.now(),
      createdBy: undefined,
      isActive: true,
      isDismissable: false,
      title: "Cluster heartbeat failing",
      topic: "system-fleet",
      variant: "error",
    })
  );

  const [globalAlerts, fleetAlerts] = await Promise.all([
    t.query(
      internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
      { isAdmin: true, topic: "global", userId: "admin_a" }
    ),
    t.query(
      internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
      { isAdmin: true, topic: "system-fleet", userId: "admin_a" }
    ),
  ]);
  expect(globalAlerts.map((alert) => alert._id)).toEqual([globalAlertId]);
  expect(fleetAlerts.map((alert) => alert._id)).toEqual([fleetAlertId]);
});

test("listActiveSystemAlertsForUserInternal hides an admins-only alert from a non-admin", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("systemAlerts", {
      audience: "admins",
      createdAt: Date.now(),
      createdBy: undefined,
      isActive: true,
      isDismissable: false,
      title: "Cluster heartbeat failing",
      topic: "system-fleet",
      variant: "error",
    })
  );

  const [asAdmin, asNonAdmin] = await Promise.all([
    t.query(
      internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
      { isAdmin: true, topic: "system-fleet", userId: "admin_a" }
    ),
    t.query(
      internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
      { isAdmin: false, topic: "system-fleet", userId: "user_a" }
    ),
  ]);
  expect(asAdmin).toHaveLength(1);
  expect(asNonAdmin).toHaveLength(0);
});

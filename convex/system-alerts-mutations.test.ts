/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("createSystemAlert rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.systemAlerts.mutations.createSystemAlert, {
      isDismissable: true,
      title: "Maintenance",
      variant: "warning",
    })
  ).rejects.toThrow("Admin access required");
});

// --- createSystemAlertInternal ----------------------------------------------

test("createSystemAlertInternal is idempotent on a repeated idempotencyKey", async () => {
  const t = convexTest(schema, modules);
  const idempotencyKey = crypto.randomUUID();

  const firstId = await t.mutation(
    internal.systemAlerts.mutations.createSystemAlertInternal,
    {
      createdBy: "admin_1",
      idempotencyKey,
      isDismissable: true,
      title: "Maintenance",
      variant: "warning",
    }
  );
  const secondId = await t.mutation(
    internal.systemAlerts.mutations.createSystemAlertInternal,
    {
      createdBy: "admin_1",
      idempotencyKey,
      isDismissable: true,
      title: "Maintenance",
      variant: "warning",
    }
  );

  expect(secondId).toBe(firstId);
  const alerts = await t.run((ctx) => ctx.db.query("systemAlerts").collect());
  expect(alerts).toHaveLength(1);
});

// --- dismissSystemAlertInternal ----------------------------------------------
//
// retractSystemAlert itself is a trivial admin-gated patch with no internal
// split (same as groups/mutations.ts#renameGroup) — the shared admin gate is
// already covered by createSystemAlert's rejection test above, so it gets no
// dedicated test of its own, matching that convention.

const seedAlert = async (
  t: ReturnType<typeof convexTest>,
  overrides: { isDismissable?: boolean } = {}
) =>
  await t.run((ctx) =>
    ctx.db.insert("systemAlerts", {
      createdAt: Date.now(),
      createdBy: "admin_1",
      isActive: true,
      isDismissable: overrides.isDismissable ?? true,
      title: "Maintenance",
      variant: "warning",
    })
  );

test("dismissSystemAlertInternal throws for a non-dismissable alert", async () => {
  const t = convexTest(schema, modules);
  const alertId = await seedAlert(t, { isDismissable: false });

  await expect(
    t.mutation(internal.systemAlerts.mutations.dismissSystemAlertInternal, {
      alertId,
      userId: "user_a",
    })
  ).rejects.toThrow("This system alert cannot be dismissed");
});

test("dismissSystemAlertInternal doesn't duplicate an existing dismissal", async () => {
  const t = convexTest(schema, modules);
  const alertId = await seedAlert(t);

  await t.mutation(internal.systemAlerts.mutations.dismissSystemAlertInternal, {
    alertId,
    userId: "user_a",
  });
  await t.mutation(internal.systemAlerts.mutations.dismissSystemAlertInternal, {
    alertId,
    userId: "user_a",
  });

  const dismissals = await t.run((ctx) =>
    ctx.db
      .query("systemAlertDismissals")
      .withIndex("by_alert_and_user", (q) =>
        q.eq("alertId", alertId).eq("userId", "user_a")
      )
      .collect()
  );
  expect(dismissals).toHaveLength(1);
});

test("dismissSystemAlertInternal only hides the alert for the dismissing user", async () => {
  const t = convexTest(schema, modules);
  const alertId = await seedAlert(t);

  await t.mutation(internal.systemAlerts.mutations.dismissSystemAlertInternal, {
    alertId,
    userId: "user_a",
  });

  const [aliceAlerts, bobAlerts] = await Promise.all([
    t.query(
      internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
      { userId: "user_a" }
    ),
    t.query(
      internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
      { userId: "user_b" }
    ),
  ]);
  expect(aliceAlerts).toHaveLength(0);
  expect(bobAlerts).toHaveLength(1);
});

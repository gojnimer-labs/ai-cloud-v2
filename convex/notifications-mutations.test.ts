/// <reference types="vite/client" />
import { register as registerWorkpool } from "@convex-dev/workpool/test";
import { register as registerNotification } from "convex-notification/test";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import authSchema from "./betterAuth/schema";
import { notifications } from "./notifications/client";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const authModules = import.meta.glob("./betterAuth/**/*.ts");

const setup = () => {
  const t = convexTest(schema, modules);
  registerNotification(t);
  // convex-notification's own delivery pool is a nested child component
  // ("notification/workpool") — convex-test doesn't auto-descend into a
  // registered component's own dependencies, so it needs its own explicit
  // registration too.
  registerWorkpool(t, "notification/workpool");
  // sendToUserInternal resolves the target's email via
  // authComponent.getAnyUserById for the history record (see
  // mutations.ts#recordSend) — needs the betterAuth component registered
  // even though these tests use plain string userIds with no real user row,
  // since getAnyUserById's lookup would otherwise throw "not registered"
  // rather than just returning null for an unknown id.
  t.registerComponent("betterAuth", authSchema, authModules);
  return t;
};

const seedGroup = async (
  t: ReturnType<typeof convexTest>,
  name = `group-${Math.random().toString(36).slice(2, 8)}`
): Promise<Id<"groups">> =>
  await t.run((ctx) =>
    ctx.db.insert("groups", { badgeColor: "blue", createdAt: Date.now(), name })
  );

test("sendToUser rejects an unauthenticated caller", async () => {
  const t = setup();
  await expect(
    t.mutation(api.notifications.mutations.sendToUser, {
      title: "Hi",
      userId: "user_a",
      variant: "info",
    })
  ).rejects.toThrow("Admin access required");
});

// --- sendToUserInternal -----------------------------------------------------
//
// Public gating is covered by sendToUser's rejection test above (every
// mutation in this file shares the same adminMutation/requireAdminUser
// gate) — this internal mutation is where the actual send logic lives, so
// it's tested directly (same reasoning as groups/mutations.ts's
// assignGroupsToUserInternal tests).

test("sendToUserInternal creates a notification for the target user", async () => {
  const t = setup();

  await t.mutation(internal.notifications.mutations.sendToUserInternal, {
    adminUserId: "admin_1",
    body: "Body text",
    href: "/somewhere",
    title: "Hello",
    userId: "user_a",
    variant: "warning",
  });

  const rows = await t.run((ctx) =>
    notifications.list(ctx, { targetId: "user_a" })
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].data).toMatchObject({
    body: "Body text",
    href: "/somewhere",
    title: "Hello",
    variant: "warning",
  });
  expect(rows[0].source).toEqual({ id: "admin_1", type: "admin" });
});

test("sendToUserInternal is idempotent on a repeated idempotencyKey", async () => {
  const t = setup();
  const idempotencyKey = crypto.randomUUID();
  const sendArgs = {
    adminUserId: "admin_1",
    idempotencyKey,
    title: "Hello",
    userId: "user_a",
    variant: "info" as const,
  };

  // Sequential on purpose: the second call must observe the first call's
  // already-committed row to actually exercise the dedup check, not race it.
  await t.mutation(
    internal.notifications.mutations.sendToUserInternal,
    sendArgs
  );
  await t.mutation(
    internal.notifications.mutations.sendToUserInternal,
    sendArgs
  );

  const rows = await t.run((ctx) =>
    notifications.list(ctx, { targetId: "user_a" })
  );
  expect(rows).toHaveLength(1);
});

test("sendToUserInternal records one notificationSends history row", async () => {
  const t = setup();

  await t.mutation(internal.notifications.mutations.sendToUserInternal, {
    adminUserId: "admin_1",
    title: "Hello",
    userId: "user_a",
    variant: "info",
  });

  const sends = await t.run((ctx) =>
    ctx.db.query("notificationSends").collect()
  );
  expect(sends).toHaveLength(1);
  expect(sends[0]).toMatchObject({
    createdBy: "admin_1",
    recipientCount: 1,
    targetMode: "user",
    title: "Hello",
  });
});

test("sendToUserInternal doesn't double the history row on a repeated idempotencyKey", async () => {
  const t = setup();
  const idempotencyKey = crypto.randomUUID();
  const sendArgs = {
    adminUserId: "admin_1",
    idempotencyKey,
    title: "Hello",
    userId: "user_a",
    variant: "info" as const,
  };

  await t.mutation(
    internal.notifications.mutations.sendToUserInternal,
    sendArgs
  );
  await t.mutation(
    internal.notifications.mutations.sendToUserInternal,
    sendArgs
  );

  const sends = await t.run((ctx) =>
    ctx.db.query("notificationSends").collect()
  );
  expect(sends).toHaveLength(1);
});

// --- broadcastToGroupsInternal -----------------------------------------------
//
// enqueueBatch fans out through a Workpool-scheduled mutation rather than
// inserting synchronously, so these tests advance fake timers and flush
// scheduled functions before asserting on delivered rows.

test("broadcastToGroupsInternal delivers to the union of every selected group's members, once each", async () => {
  vi.useFakeTimers();
  const t = setup();
  const groupA = await seedGroup(t);
  const groupB = await seedGroup(t);
  await t.run((ctx) =>
    Promise.all([
      ctx.db.insert("groupMembers", { groupId: groupA, userId: "user_a" }),
      ctx.db.insert("groupMembers", { groupId: groupA, userId: "user_b" }),
      // user_b is in both groups — must be delivered to exactly once, not
      // twice.
      ctx.db.insert("groupMembers", { groupId: groupB, userId: "user_b" }),
      ctx.db.insert("groupMembers", { groupId: groupB, userId: "user_c" }),
    ])
  );

  await t.mutation(internal.notifications.mutations.broadcastToGroupsInternal, {
    adminUserId: "admin_1",
    groupIds: [groupA, groupB],
    title: "Broadcast",
    variant: "success",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const [rowsA, rowsB, rowsC] = await Promise.all(
    ["user_a", "user_b", "user_c"].map((targetId) =>
      t.run((ctx) => notifications.list(ctx, { targetId }))
    )
  );
  expect(rowsA).toHaveLength(1);
  expect(rowsB).toHaveLength(1);
  expect(rowsC).toHaveLength(1);
  vi.useRealTimers();
});

test("broadcastToGroupsInternal is idempotent on a repeated idempotencyKey", async () => {
  vi.useFakeTimers();
  const t = setup();
  const groupId = await seedGroup(t);
  await t.run((ctx) =>
    ctx.db.insert("groupMembers", { groupId, userId: "user_a" })
  );
  const idempotencyKey = crypto.randomUUID();
  const broadcastArgs = {
    adminUserId: "admin_1",
    groupIds: [groupId],
    idempotencyKey,
    title: "Broadcast",
    variant: "success" as const,
  };

  // Sequential on purpose — see sendToUserInternal's idempotency test above.
  await t.mutation(
    internal.notifications.mutations.broadcastToGroupsInternal,
    broadcastArgs
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.mutation(
    internal.notifications.mutations.broadcastToGroupsInternal,
    broadcastArgs
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const rows = await t.run((ctx) =>
    notifications.list(ctx, { targetId: "user_a" })
  );
  expect(rows).toHaveLength(1);
  vi.useRealTimers();
});

test("broadcastToGroupsInternal records one notificationSends history row with the joined group names", async () => {
  vi.useFakeTimers();
  const t = setup();
  const groupA = await seedGroup(t, "Engineering");
  const groupB = await seedGroup(t, "Design");
  await t.run((ctx) =>
    Promise.all([
      ctx.db.insert("groupMembers", { groupId: groupA, userId: "user_a" }),
      ctx.db.insert("groupMembers", { groupId: groupB, userId: "user_b" }),
    ])
  );

  await t.mutation(internal.notifications.mutations.broadcastToGroupsInternal, {
    adminUserId: "admin_1",
    groupIds: [groupA, groupB],
    title: "Broadcast",
    variant: "success",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const sends = await t.run((ctx) =>
    ctx.db.query("notificationSends").collect()
  );
  expect(sends).toHaveLength(1);
  expect(sends[0]).toMatchObject({
    recipientCount: 2,
    targetMode: "groups",
    targetSummary: "Engineering, Design",
  });
  vi.useRealTimers();
});

// --- enqueueEveryoneBroadcastInternal -----------------------------------------
//
// broadcastToEveryone (actions.ts) resolves targetIds via the admin plugin's
// listUsers endpoint, then hands off to this internal mutation for the
// actual send — same split as broadcastToGroupsInternal above, tested
// directly for the same reason.

test("enqueueEveryoneBroadcastInternal delivers to every given target and records history", async () => {
  vi.useFakeTimers();
  const t = setup();

  await t.mutation(
    internal.notifications.mutations.enqueueEveryoneBroadcastInternal,
    {
      adminUserId: "admin_1",
      targetIds: ["user_a", "user_b", "user_c"],
      title: "Everyone broadcast",
      variant: "info",
    }
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const [rowsA, rowsB, rowsC] = await Promise.all(
    ["user_a", "user_b", "user_c"].map((targetId) =>
      t.run((ctx) => notifications.list(ctx, { targetId }))
    )
  );
  expect(rowsA).toHaveLength(1);
  expect(rowsB).toHaveLength(1);
  expect(rowsC).toHaveLength(1);

  const sends = await t.run((ctx) =>
    ctx.db.query("notificationSends").collect()
  );
  expect(sends).toHaveLength(1);
  expect(sends[0]).toMatchObject({ recipientCount: 3, targetMode: "everyone" });
  vi.useRealTimers();
});

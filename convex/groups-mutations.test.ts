/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const seedGroup = async (
  t: ReturnType<typeof convexTest>,
  name = `group-${Math.random().toString(36).slice(2, 8)}`
): Promise<Id<"groups">> =>
  await t.run((ctx) =>
    ctx.db.insert("groups", { createdAt: Date.now(), name })
  );

test("createGroup rejects an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.groups.mutations.createGroup, { name: "engineering" })
  ).rejects.toThrow("Admin access required");
});

// --- assignGroupsToUserInternal --------------------------------------------
//
// Public gating is covered by createGroup's rejection test above (every
// mutation in this file shares the same adminMutation/requireAdminUser
// gate) — this internal mutation is where the actual assignment logic lives,
// so it's tested directly (same reasoning as admin/mutations.ts's
// stopAllWorkloadsForUserInternal tests).

test("assignGroupsToUserInternal adds membership rows for real groups", async () => {
  const t = convexTest(schema, modules);
  const groupA = await seedGroup(t);
  const groupB = await seedGroup(t);

  await t.mutation(internal.groups.mutations.assignGroupsToUserInternal, {
    groupIds: [groupA, groupB],
    userId: "user_a",
  });

  const memberships = await t.run((ctx) =>
    ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", "user_a"))
      .collect()
  );
  expect(new Set(memberships.map((m) => m.groupId))).toEqual(
    new Set([groupA, groupB])
  );
});

test("assignGroupsToUserInternal silently skips a groupId that no longer resolves to a group", async () => {
  const t = convexTest(schema, modules);
  const groupA = await seedGroup(t);
  const deletedGroup = await seedGroup(t);
  await t.run((ctx) => ctx.db.delete(deletedGroup));

  await t.mutation(internal.groups.mutations.assignGroupsToUserInternal, {
    groupIds: [groupA, deletedGroup],
    userId: "user_a",
  });

  const memberships = await t.run((ctx) =>
    ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", "user_a"))
      .collect()
  );
  expect(memberships.map((m) => m.groupId)).toEqual([groupA]);
});

test("assignGroupsToUserInternal doesn't duplicate an existing membership", async () => {
  const t = convexTest(schema, modules);
  const groupA = await seedGroup(t);
  await t.run((ctx) =>
    ctx.db.insert("groupMembers", { groupId: groupA, userId: "user_a" })
  );

  await t.mutation(internal.groups.mutations.assignGroupsToUserInternal, {
    groupIds: [groupA],
    userId: "user_a",
  });

  const memberships = await t.run((ctx) =>
    ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", "user_a"))
      .collect()
  );
  expect(memberships).toHaveLength(1);
});

// --- setUserGroupsInternal --------------------------------------------------

test("setUserGroupsInternal replaces a user's memberships to match the desired set", async () => {
  const t = convexTest(schema, modules);
  const kept = await seedGroup(t);
  const removed = await seedGroup(t);
  const added = await seedGroup(t);
  await t.run((ctx) =>
    Promise.all([
      ctx.db.insert("groupMembers", { groupId: kept, userId: "user_a" }),
      ctx.db.insert("groupMembers", { groupId: removed, userId: "user_a" }),
      // A different user's membership in `removed` must never be touched.
      ctx.db.insert("groupMembers", { groupId: removed, userId: "user_b" }),
    ])
  );

  await t.mutation(internal.groups.mutations.setUserGroupsInternal, {
    groupIds: [kept, added],
    userId: "user_a",
  });

  const userAMemberships = await t.run((ctx) =>
    ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", "user_a"))
      .collect()
  );
  expect(new Set(userAMemberships.map((row) => row.groupId))).toEqual(
    new Set([kept, added])
  );

  const userBStillMember = await t.run((ctx) =>
    ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_user", (q) =>
        q.eq("groupId", removed).eq("userId", "user_b")
      )
      .unique()
  );
  expect(userBStillMember).not.toBeNull();
});

// --- deleteGroupInternal -----------------------------------------------------

test("deleteGroupInternal removes the group and every membership row for it", async () => {
  const t = convexTest(schema, modules);
  const groupId = await seedGroup(t);
  await t.run((ctx) =>
    Promise.all([
      ctx.db.insert("groupMembers", { groupId, userId: "user_a" }),
      ctx.db.insert("groupMembers", { groupId, userId: "user_b" }),
    ])
  );

  await t.mutation(internal.groups.mutations.deleteGroupInternal, {
    groupId,
  });

  const group = await t.run((ctx) => ctx.db.get(groupId));
  expect(group).toBeNull();
  const remainingMembers = await t.run((ctx) =>
    ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect()
  );
  expect(remainingMembers).toHaveLength(0);
});

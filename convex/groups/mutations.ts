import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { adminMutation } from "../functions";

const badgeColorValidator = v.union(
  v.literal("blue"),
  v.literal("cyan"),
  v.literal("green"),
  v.literal("orange"),
  v.literal("pink"),
  v.literal("purple"),
  v.literal("red"),
  v.literal("teal"),
  v.literal("yellow")
);

export const createGroup = adminMutation({
  args: { badgeColor: badgeColorValidator, name: v.string() },
  handler: async (ctx, args) =>
    await ctx.db.insert("groups", {
      badgeColor: args.badgeColor,
      createdAt: Date.now(),
      name: args.name,
    }),
  returns: v.id("groups"),
});

export const updateGroup = adminMutation({
  args: {
    badgeColor: badgeColorValidator,
    groupId: v.id("groups"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.groupId, {
      badgeColor: args.badgeColor,
      name: args.name,
    });
    return null;
  },
  returns: v.null(),
});

const DELETE_BATCH_SIZE = 200;

// Actual membership-cleanup logic, split into its own internal mutation so
// it can reschedule itself (see below) and so it's directly testable — same
// split as workloads/mutations.ts#stopAllWorkloadsForUserInternal.
export const deleteGroupInternal = internalMutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .take(DELETE_BATCH_SIZE);
    await Promise.all(members.map((member) => ctx.db.delete(member._id)));
    if (members.length === DELETE_BATCH_SIZE) {
      // More members than fit in one transaction — reschedule to keep
      // deleting instead of risking this mutation's read/write limits.
      await ctx.scheduler.runAfter(
        0,
        internal.groups.mutations.deleteGroupInternal,
        args
      );
      return null;
    }
    await ctx.db.delete(args.groupId);
    return null;
  },
  returns: v.null(),
});

export const deleteGroup = adminMutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.groups.mutations.deleteGroupInternal, args);
    return null;
  },
  returns: v.null(),
});

// Full-replace diff logic for a user's group memberships, split into its own
// internal mutation so it's directly testable without standing up a full
// admin-authenticated identity in convex-test — same split as
// workloads/mutations.ts#stopAllWorkloadsForUserInternal.
export const setUserGroupsInternal = internalMutation({
  args: { groupIds: v.array(v.id("groups")), userId: v.string() },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(500);
    const desiredGroupIds = new Set(args.groupIds);
    const currentGroupIds = new Set(
      current.map((membership) => membership.groupId)
    );

    await Promise.all(
      current
        .filter((membership) => !desiredGroupIds.has(membership.groupId))
        .map((membership) => ctx.db.delete(membership._id))
    );
    await Promise.all(
      args.groupIds
        .filter((groupId) => !currentGroupIds.has(groupId))
        .map((groupId) =>
          ctx.db.insert("groupMembers", { groupId, userId: args.userId })
        )
    );
    return null;
  },
  returns: v.null(),
});

// Called from the admin user detail panel.
export const setUserGroups = adminMutation({
  args: { groupIds: v.array(v.id("groups")), userId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.groups.mutations.setUserGroupsInternal,
      args
    );
    return null;
  },
  returns: v.null(),
});

// Applies an invite's default groupIds (plain strings — see
// convex/betterAuth/schema.ts's invite.groupIds and convex/auth.ts's
// applyInviteGroups hook) to a newly created user. Silently skips a groupId
// that no longer resolves to a real group (e.g. deleted between invite
// creation and signup) or that the user is already a member of, rather than
// failing signup over it.
export const assignGroupsToUserInternal = internalMutation({
  args: { groupIds: v.array(v.string()), userId: v.string() },
  handler: async (ctx, args) => {
    await Promise.all(
      args.groupIds.map(async (groupId) => {
        const group = await ctx.db.get(groupId as Id<"groups">);
        if (!group) {
          return;
        }
        const existing = await ctx.db
          .query("groupMembers")
          .withIndex("by_group_and_user", (q) =>
            q.eq("groupId", group._id).eq("userId", args.userId)
          )
          .unique();
        if (existing) {
          return;
        }
        await ctx.db.insert("groupMembers", {
          groupId: group._id,
          userId: args.userId,
        });
      })
    );
    return null;
  },
  returns: v.null(),
});

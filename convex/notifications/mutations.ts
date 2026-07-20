import type { Infer } from "convex/values";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { adminMutation } from "../functions";
import { notificationVariantValidator } from "../schema";
import { notifications, selfNotificationAPI } from "./client";

type NotificationVariant = Infer<typeof notificationVariantValidator>;

// Self-serve state changes for the currently authenticated user's own
// inbox — re-exported as-is from the shared makeNotificationAPI object (see
// client.ts's doc comment).
export const { markSeen, markAllSeen, dismiss, dismissAll } =
  selfNotificationAPI;

// Shared fields for every admin-composed send — one kind (admin_message)
// covers specific-user, group-broadcast, and everyone-broadcast alike; they
// differ only in how targetId(s) are resolved below, not in payload shape.
// `idempotencyKey` is minted once per compose-dialog submission on the
// frontend and forwarded verbatim as the package's own dedupeKey/
// dedupeKeyPrefix, so a retried or double-submitted send is a no-op rather
// than a duplicate notification (see convex-notification's by_target_dedupe
// index check in its create/enqueueBatch handlers).
const sendFields = {
  body: v.optional(v.string()),
  href: v.optional(v.string()),
  idempotencyKey: v.optional(v.string()),
  title: v.string(),
  variant: notificationVariantValidator,
};

const messageData = (args: {
  body?: string;
  href?: string;
  title: string;
  variant: NotificationVariant;
}) => ({
  body: args.body,
  href: args.href,
  title: args.title,
  variant: args.variant,
});

// Actual send logic, split into its own internal mutation so it's directly
// testable without standing up a full admin-authenticated identity in
// convex-test — same split as groups/mutations.ts#assignGroupsToUserInternal.
export const sendToUserInternal = internalMutation({
  args: { ...sendFields, adminUserId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    await notifications.create(ctx, {
      data: messageData(args),
      dedupeKey: args.idempotencyKey,
      kind: "admin_message",
      source: { id: args.adminUserId, type: "admin" },
      targetId: args.userId,
    });
    return null;
  },
  returns: v.null(),
});

export const sendToUser = adminMutation({
  args: { ...sendFields, userId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.notifications.mutations.sendToUserInternal, {
      ...args,
      adminUserId: ctx.user._id,
    });
    return null;
  },
  returns: v.null(),
});

// Same split as sendToUserInternal above.
export const broadcastToGroupsInternal = internalMutation({
  args: {
    ...sendFields,
    adminUserId: v.string(),
    groupIds: v.array(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const memberLists = await Promise.all(
      args.groupIds.map((groupId) =>
        ctx.db
          .query("groupMembers")
          .withIndex("by_group", (q) => q.eq("groupId", groupId))
          .take(2000)
      )
    );
    const targetIds = new Set<string>();
    for (const members of memberLists) {
      for (const member of members) {
        targetIds.add(member.userId);
      }
    }
    await notifications.enqueueBatch(ctx, {
      createdBy: args.adminUserId,
      data: messageData(args),
      dedupeKeyPrefix: args.idempotencyKey,
      kind: "admin_message",
      targetIds: [...targetIds],
    });
    return null;
  },
  returns: v.null(),
});

export const broadcastToGroups = adminMutation({
  args: { ...sendFields, groupIds: v.array(v.id("groups")) },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.notifications.mutations.broadcastToGroupsInternal,
      { ...args, adminUserId: ctx.user._id }
    );
    return null;
  },
  returns: v.null(),
});

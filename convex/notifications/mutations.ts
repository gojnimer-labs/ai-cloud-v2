import type { Infer } from "convex/values";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { authComponent } from "../auth";
import { adminMutation } from "../functions";
import { notificationVariantValidator } from "../schema";
import { notifications, selfNotificationAPI } from "./client";

type NotificationVariant = Infer<typeof notificationVariantValidator>;

const targetModeValidator = v.union(
  v.literal("everyone"),
  v.literal("groups"),
  v.literal("user")
);
type TargetMode = Infer<typeof targetModeValidator>;

// Records one row per completed send for the admin history table (see
// notifications/queries.ts#listHistoryForAdmin) — a display/audit record
// only, no bearing on actual delivery. Dedup-checked by idempotencyKey, same
// convention as systemAlerts/mutations.ts#createSystemAlertInternal, so a
// retried/double-submitted send doesn't also double the history.
const recordSend = async (
  ctx: MutationCtx,
  args: {
    body?: string;
    createdBy: string;
    href?: string;
    idempotencyKey?: string;
    recipientCount: number;
    targetMode: TargetMode;
    targetSummary?: string;
    title: string;
    variant: NotificationVariant;
  }
) => {
  if (args.idempotencyKey) {
    const existing = await ctx.db
      .query("notificationSends")
      .withIndex("by_idempotencyKey", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .first();
    if (existing) {
      return;
    }
  }
  await ctx.db.insert("notificationSends", { ...args, createdAt: Date.now() });
};

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

// Extracts just sendFields' own keys from an internal mutation's args
// (which also carry mode-specific fields like userId/groupIds/adminUserId
// that must NOT leak into a notificationSends row's Convex-validated
// shape — ctx.db.insert rejects any field not in the table's schema).
const pickSendFields = (args: {
  body?: string;
  href?: string;
  idempotencyKey?: string;
  title: string;
  variant: NotificationVariant;
}) => ({
  body: args.body,
  href: args.href,
  idempotencyKey: args.idempotencyKey,
  title: args.title,
  variant: args.variant,
});

// Actual send logic, split into its own internal mutation so it's directly
// testable without standing up a full admin-authenticated identity in
// convex-test — same split as groups/mutations.ts#assignGroupsToUserInternal.
export const sendToUserInternal = internalMutation({
  args: { ...sendFields, adminUserId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const { created } = await notifications.create(ctx, {
      data: messageData(args),
      dedupeKey: args.idempotencyKey,
      kind: "admin_message",
      source: { id: args.adminUserId, type: "admin" },
      targetId: args.userId,
    });
    if (created) {
      const targetUser = await authComponent.getAnyUserById(ctx, args.userId);
      await recordSend(ctx, {
        ...pickSendFields(args),
        createdBy: args.adminUserId,
        recipientCount: 1,
        targetMode: "user",
        targetSummary: targetUser?.email,
      });
    }
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
    const [memberLists, groups] = await Promise.all([
      Promise.all(
        args.groupIds.map((groupId) =>
          ctx.db
            .query("groupMembers")
            .withIndex("by_group", (q) => q.eq("groupId", groupId))
            .take(2000)
        )
      ),
      Promise.all(args.groupIds.map((groupId) => ctx.db.get(groupId))),
    ]);
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
    await recordSend(ctx, {
      ...pickSendFields(args),
      createdBy: args.adminUserId,
      recipientCount: targetIds.size,
      targetMode: "groups",
      targetSummary: groups
        .filter((group) => group !== null)
        .map((group) => group.name)
        .join(", "),
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

// broadcastToEveryone (actions.ts) needs an action (not a mutation) to
// enumerate every user via the admin plugin's listUsers endpoint — but
// notifications.enqueueBatch's ctx parameter type isn't satisfied by an
// action ctx that's been through convex-helpers' customAction wrapper
// (only by a plain mutation ctx, same as broadcastToGroupsInternal above),
// so the actual enqueue is split out into this internal mutation and
// invoked via ctx.runMutation from the action once targetIds are resolved.
export const enqueueEveryoneBroadcastInternal = internalMutation({
  args: {
    ...sendFields,
    adminUserId: v.string(),
    targetIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await notifications.enqueueBatch(ctx, {
      createdBy: args.adminUserId,
      data: messageData(args),
      dedupeKeyPrefix: args.idempotencyKey,
      kind: "admin_message",
      targetIds: args.targetIds,
    });
    await recordSend(ctx, {
      ...pickSendFields(args),
      createdBy: args.adminUserId,
      recipientCount: args.targetIds.length,
      targetMode: "everyone",
    });
    return null;
  },
  returns: v.null(),
});

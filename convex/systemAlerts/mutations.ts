import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { adminMutation, authedMutation } from "../functions";
import { appError } from "../lib/errors";
import { notificationVariantValidator } from "../schema";

// Actual create logic (including the idempotency dedup check), split into
// its own internal mutation so it's directly testable without standing up a
// full admin-authenticated identity in convex-test — same split as
// groups/mutations.ts#assignGroupsToUserInternal.
export const createSystemAlertInternal = internalMutation({
  args: {
    body: v.optional(v.string()),
    createdBy: v.string(),
    href: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    isDismissable: v.boolean(),
    title: v.string(),
    variant: notificationVariantValidator,
  },
  handler: async (ctx, args) => {
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("systemAlerts")
        .withIndex("by_idempotencyKey", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey)
        )
        .first();
      if (existing) {
        return existing._id;
      }
    }

    return await ctx.db.insert("systemAlerts", {
      body: args.body,
      createdAt: Date.now(),
      createdBy: args.createdBy,
      href: args.href,
      idempotencyKey: args.idempotencyKey,
      isActive: true,
      isDismissable: args.isDismissable,
      title: args.title,
      variant: args.variant,
    });
  },
  returns: v.id("systemAlerts"),
});

export const createSystemAlert = adminMutation({
  args: {
    body: v.optional(v.string()),
    href: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    isDismissable: v.boolean(),
    title: v.string(),
    variant: notificationVariantValidator,
  },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      internal.systemAlerts.mutations.createSystemAlertInternal,
      { ...args, createdBy: ctx.user._id }
    ),
  returns: v.id("systemAlerts"),
});

export const retractSystemAlert = adminMutation({
  args: { alertId: v.id("systemAlerts") },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) {
      throw appError("system_alert.not_found");
    }
    await ctx.db.patch(args.alertId, {
      isActive: false,
      retractedAt: Date.now(),
    });
    return null;
  },
  returns: v.null(),
});

// Per-user, permanent — a dismissed alert stays active/visible for every
// other user (see convex/schema.ts's systemAlertDismissals comment). Only
// legal when the alert was posted as dismissable; a non-dismissable alert
// has no per-user hide, so this rejects rather than silently no-oping. Split
// into its own internal mutation for the same testability reason as
// createSystemAlertInternal above.
export const dismissSystemAlertInternal = internalMutation({
  args: { alertId: v.id("systemAlerts"), userId: v.string() },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) {
      throw appError("system_alert.not_found");
    }
    if (!alert.isDismissable) {
      throw appError("system_alert.not_dismissable");
    }

    const existing = await ctx.db
      .query("systemAlertDismissals")
      .withIndex("by_alert_and_user", (q) =>
        q.eq("alertId", args.alertId).eq("userId", args.userId)
      )
      .unique();
    if (existing) {
      return null;
    }

    await ctx.db.insert("systemAlertDismissals", {
      alertId: args.alertId,
      userId: args.userId,
    });
    return null;
  },
  returns: v.null(),
});

export const dismissSystemAlert = authedMutation({
  args: { alertId: v.id("systemAlerts") },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.systemAlerts.mutations.dismissSystemAlertInternal,
      { alertId: args.alertId, userId: ctx.user._id }
    );
    return null;
  },
  returns: v.null(),
});

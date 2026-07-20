import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { adminQuery, authedQuery } from "../functions";
import { notificationVariantValidator } from "../schema";

const systemAlertValidator = v.object({
  _id: v.id("systemAlerts"),
  body: v.optional(v.string()),
  createdAt: v.number(),
  createdBy: v.string(),
  href: v.optional(v.string()),
  isActive: v.boolean(),
  isDismissable: v.boolean(),
  retractedAt: v.optional(v.number()),
  title: v.string(),
  variant: notificationVariantValidator,
});

const ACTIVE_ALERTS_LIMIT = 50;
const USER_DISMISSALS_LIMIT = 200;

// Active alerts a given user hasn't dismissed — merges a small bounded scan
// of active alerts with that user's own dismissal rows rather than a
// per-alert existence check, since both sides are small (admin-authored
// banners, not a per-user-growing table). Split into its own internalQuery
// (args: userId, not derived from ctx) so it's directly testable without
// standing up a full authenticated identity in convex-test — same
// "internal function takes the id, public wrapper derives it" split already
// used for mutations (e.g. groups/mutations.ts#assignGroupsToUserInternal),
// and the same shape as files/queries.ts#listByGroup for a user-scoped read.
export const listActiveSystemAlertsForUserInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const activeAlerts = await ctx.db
      .query("systemAlerts")
      .withIndex("by_isActive_and_createdAt", (q) => q.eq("isActive", true))
      .order("desc")
      .take(ACTIVE_ALERTS_LIMIT);

    const myDismissals = await ctx.db
      .query("systemAlertDismissals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(USER_DISMISSALS_LIMIT);
    const dismissedAlertIds = new Set(
      myDismissals.map((dismissal) => dismissal.alertId)
    );

    return activeAlerts
      .filter((alert) => !dismissedAlertIds.has(alert._id))
      .map((alert) => ({
        _id: alert._id,
        body: alert.body,
        createdAt: alert.createdAt,
        createdBy: alert.createdBy,
        href: alert.href,
        isActive: alert.isActive,
        isDismissable: alert.isDismissable,
        retractedAt: alert.retractedAt,
        title: alert.title,
        variant: alert.variant,
      }));
  },
  returns: v.array(systemAlertValidator),
});

export const listActiveSystemAlertsForCurrentUser = authedQuery({
  args: {},
  handler: async (ctx) =>
    await ctx.runQuery(
      internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
      { userId: ctx.user._id }
    ),
  returns: v.array(systemAlertValidator),
});

// Every alert (active + retracted), for the admin table — bounded rather
// than paginated, same "fleet overview" convention as listGroups/listFiles.
export const listAllForAdmin = adminQuery({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db.query("systemAlerts").order("desc").take(200);
    return alerts.map((alert) => ({
      _id: alert._id,
      body: alert.body,
      createdAt: alert.createdAt,
      createdBy: alert.createdBy,
      href: alert.href,
      isActive: alert.isActive,
      isDismissable: alert.isDismissable,
      retractedAt: alert.retractedAt,
      title: alert.title,
      variant: alert.variant,
    }));
  },
  returns: v.array(systemAlertValidator),
});

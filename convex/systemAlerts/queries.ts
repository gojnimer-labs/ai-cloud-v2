import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { adminQuery, authedQuery } from "../functions";
import { notificationVariantValidator } from "../schema";

const systemAlertValidator = v.object({
  _id: v.id("systemAlerts"),
  audience: v.union(v.literal("admins"), v.literal("everyone")),
  body: v.optional(v.string()),
  createdAt: v.number(),
  createdBy: v.optional(v.string()),
  href: v.optional(v.string()),
  isActive: v.boolean(),
  isDismissable: v.boolean(),
  retractedAt: v.optional(v.number()),
  title: v.string(),
  topic: v.string(),
  variant: notificationVariantValidator,
});

const ACTIVE_ALERTS_LIMIT = 50;
const USER_DISMISSALS_LIMIT = 200;
const GLOBAL_TOPIC = "global";

const projectAlert = (alert: Doc<"systemAlerts">) => ({
  _id: alert._id,
  audience: alert.audience,
  body: alert.body,
  createdAt: alert.createdAt,
  createdBy: alert.createdBy,
  href: alert.href,
  isActive: alert.isActive,
  isDismissable: alert.isDismissable,
  retractedAt: alert.retractedAt,
  title: alert.title,
  topic: alert.topic,
  variant: alert.variant,
});

// Active alerts for a given topic (default "global", the app-shell banner)
// that the given user hasn't dismissed and is allowed to see — merges a
// small bounded scan of that topic's active alerts with the user's own
// dismissal rows rather than a per-alert existence check, since both sides
// are small (admin/system-authored banners, not a per-user-growing table).
// Split into its own internalQuery (args: userId/isAdmin, not derived from
// ctx) so it's directly testable without standing up a full authenticated
// identity in convex-test — same "internal function takes the id, public
// wrapper derives it" split already used for mutations (e.g.
// groups/mutations.ts#assignGroupsToUserInternal).
export const listActiveSystemAlertsForUserInternal = internalQuery({
  args: {
    isAdmin: v.boolean(),
    topic: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const activeAlerts = await ctx.db
      .query("systemAlerts")
      .withIndex("by_topic_and_isActive_and_createdAt", (q) =>
        q.eq("topic", args.topic).eq("isActive", true)
      )
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
      .filter(
        (alert) =>
          !dismissedAlertIds.has(alert._id) &&
          (args.isAdmin || alert.audience !== "admins")
      )
      .map(projectAlert);
  },
  returns: v.array(systemAlertValidator),
});

export const listActiveSystemAlertsForCurrentUser = authedQuery({
  args: { topic: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await ctx.runQuery(
      internal.systemAlerts.queries.listActiveSystemAlertsForUserInternal,
      {
        isAdmin: ctx.user.role === "admin",
        topic: args.topic ?? GLOBAL_TOPIC,
        userId: ctx.user._id,
      }
    ),
  returns: v.array(systemAlertValidator),
});

// Every alert (active + retracted), for the admin table — bounded rather
// than paginated, same "fleet overview" convention as listGroups/listFiles.
export const listAllForAdmin = adminQuery({
  args: {},
  handler: async (ctx) => {
    const alerts = await ctx.db.query("systemAlerts").order("desc").take(200);
    return alerts.map(projectAlert);
  },
  returns: v.array(systemAlertValidator),
});

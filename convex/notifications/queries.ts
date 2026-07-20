import type { Infer } from "convex/values";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { adminQuery } from "../functions";
import { notificationVariantValidator } from "../schema";
import { selfNotificationAPI } from "./client";

// Self-serve inbox reads for the currently authenticated user — re-exported
// as-is from the shared makeNotificationAPI object (see client.ts's doc
// comment). This module is the boundary every caller (frontend, other
// convex/ code) imports through, never the component directly — if
// convex-notification is ever ejected, only client.ts's internals change.
export const { list, listPage, counts, unseenCount } = selfNotificationAPI;

const HISTORY_LIMIT = 200;

// One row shape covering both a standing systemAlerts row and a one-shot
// notificationSends row — kind discriminates which, the rest of the fields
// are simply absent for whichever kind they don't apply to. Kept as one
// flat validator (matching this codebase's other admin list views) rather
// than a real discriminated union, since the admin table renders both kinds
// side by side as one merged history anyway.
const historyRowValidator = v.object({
  _id: v.string(),
  alertId: v.optional(v.id("systemAlerts")),
  audience: v.optional(v.union(v.literal("admins"), v.literal("everyone"))),
  createdAt: v.number(),
  createdBy: v.optional(v.string()),
  isActive: v.optional(v.boolean()),
  kind: v.union(v.literal("alert"), v.literal("send")),
  recipientCount: v.optional(v.number()),
  targetMode: v.optional(
    v.union(v.literal("everyone"), v.literal("groups"), v.literal("user"))
  ),
  targetSummary: v.optional(v.string()),
  title: v.string(),
  topic: v.optional(v.string()),
  variant: notificationVariantValidator,
});

type HistoryRow = Infer<typeof historyRowValidator>;

// Everything ever sent/posted from the admin notifications page, merged
// into one time-ordered history: standing systemAlerts alongside one-shot
// admin_message sends (see notifications/mutations.ts#recordSend for how
// the latter gets recorded). Bounded rather than paginated, same
// "fleet overview" convention as listGroups/listFiles. Split into its own
// internalQuery so it's directly testable without standing up a full
// admin-authenticated identity in convex-test — same split as
// systemAlerts/queries.ts#listActiveSystemAlertsForUserInternal.
export const listHistoryForAdminInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<HistoryRow[]> => {
    const [alerts, sends] = await Promise.all([
      ctx.db.query("systemAlerts").order("desc").take(HISTORY_LIMIT),
      ctx.db.query("notificationSends").order("desc").take(HISTORY_LIMIT),
    ]);
    const alertRows = alerts.map((alert) => ({
      _id: alert._id,
      alertId: alert._id,
      audience: alert.audience,
      createdAt: alert.createdAt,
      createdBy: alert.createdBy,
      isActive: alert.isActive,
      kind: "alert" as const,
      title: alert.title,
      topic: alert.topic,
      variant: alert.variant,
    }));
    const sendRows = sends.map((send) => ({
      _id: send._id,
      createdAt: send.createdAt,
      createdBy: send.createdBy,
      kind: "send" as const,
      recipientCount: send.recipientCount,
      targetMode: send.targetMode,
      targetSummary: send.targetSummary,
      title: send.title,
      variant: send.variant,
    }));
    return [...alertRows, ...sendRows]
      .toSorted((a, b) => b.createdAt - a.createdAt)
      .slice(0, HISTORY_LIMIT);
  },
  returns: v.array(historyRowValidator),
});

export const listHistoryForAdmin = adminQuery({
  args: {},
  handler: async (ctx): Promise<HistoryRow[]> =>
    await ctx.runQuery(
      internal.notifications.queries.listHistoryForAdminInternal
    ),
  returns: v.array(historyRowValidator),
});

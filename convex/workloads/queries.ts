import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { authComponent } from "../auth";

const workloadRowValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("workloads"),
  createdAt: v.number(),
  name: v.string(),
  namespace: v.string(),
  operatorId: v.id("operators"),
  subdomain: v.optional(v.string()),
  templateId: v.string(),
  userId: v.string(),
});

// Public and reactive, unlike workloads/actions.ts#listMyWorkloads (an
// action, since live phase/readyReplicas needs a fetch to the operator).
// This only ever reflects the `workloads` table itself — ownership rows the
// operator's reconciler callback writes (see operators/http.ts) — so a
// deploy/removal shows up here the moment that callback lands, without
// waiting on the client's status-poll interval. No status field, same as
// the table itself; callers merge in live status separately.
export const listOwned = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      return [];
    }
    return await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(50);
  },
  returns: v.array(workloadRowValidator),
});

export const listByUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(50),
  returns: v.array(workloadRowValidator),
});

// Ownership-checked lookup by row id — returns null (not an error) on
// mismatch or missing row, so a non-owner can't distinguish "doesn't exist"
// from "not yours."
export const getOwned = internalQuery({
  args: { userId: v.string(), workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row || row.userId !== args.userId) {
      return null;
    }
    return row;
  },
  returns: v.union(workloadRowValidator, v.null()),
});

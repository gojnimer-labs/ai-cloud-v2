import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

const workloadRowValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("workloads"),
  createdAt: v.number(),
  image: v.string(),
  name: v.string(),
  namespace: v.string(),
  operatorId: v.id("operators"),
  subdomain: v.optional(v.string()),
  userId: v.string(),
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

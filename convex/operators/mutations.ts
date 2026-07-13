import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

// Upserts by name: the operator re-registers with the same name on every
// restart (falling back from a rejected persisted token), so this must be
// idempotent rather than always inserting a new row.
export const upsert = internalMutation({
  args: {
    deployToken: v.string(),
    externalUrl: v.string(),
    heartbeatTokenHash: v.string(),
    metadata: v.optional(v.any()),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("operators")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        deployToken: args.deployToken,
        externalUrl: args.externalUrl,
        heartbeatTokenHash: args.heartbeatTokenHash,
        metadata: args.metadata,
        status: "active",
      });
      return existing._id;
    }

    return await ctx.db.insert("operators", {
      deployToken: args.deployToken,
      externalUrl: args.externalUrl,
      heartbeatTokenHash: args.heartbeatTokenHash,
      metadata: args.metadata,
      name: args.name,
      registeredAt: Date.now(),
      status: "active",
    });
  },
  returns: v.id("operators"),
});

// Admin cleanup — e.g. removing a stale/test registration row. Internal
// only: never exposed to the browser.
export const remove = internalMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.operatorId);
    return null;
  },
  returns: v.null(),
});

export const markHeartbeat = internalMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.operatorId, {
      lastHeartbeatAt: Date.now(),
      status: "active",
    });
    return null;
  },
  returns: v.null(),
});

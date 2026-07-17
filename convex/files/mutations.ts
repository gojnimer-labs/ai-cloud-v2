import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

// Records one file (see convex/schema.ts). Generic on purpose: any future
// group/type reuses this same mutation.
export const create = internalMutation({
  args: {
    createdAt: v.number(),
    group: v.string(),
    label: v.string(),
    r2Bucket: v.string(),
    r2Key: v.string(),
    type: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => await ctx.db.insert("files", args),
  returns: v.id("files"),
});

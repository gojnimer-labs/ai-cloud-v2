import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

// Records one option for a dynamic-select source (see convex/schema.ts).
// Generic on purpose: any future dataSource.kind:"dynamic" parameter reuses
// this same mutation, just with a different sourceKey/data shape.
export const create = internalMutation({
  args: {
    createdAt: v.number(),
    data: v.optional(v.any()),
    label: v.string(),
    sourceKey: v.string(),
    updatedAt: v.number(),
    userId: v.string(),
  },
  handler: async (ctx, args) => await ctx.db.insert("selectOptions", args),
  returns: v.id("selectOptions"),
});

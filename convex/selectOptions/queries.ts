import { v } from "convex/values";

import { internalQuery } from "../_generated/server";

// Lists every option for one dynamic-select source — the options a
// "select_<sourceKey>" catalog parameter offers. Not filtered by user for
// now (POC-stage simplification, see convex/schema.ts).
export const listBySource = internalQuery({
  args: { sourceKey: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("selectOptions")
      .withIndex("by_source", (q) => q.eq("sourceKey", args.sourceKey))
      .collect(),
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      _id: v.id("selectOptions"),
      createdAt: v.number(),
      data: v.optional(v.any()),
      label: v.string(),
      sourceKey: v.string(),
      updatedAt: v.number(),
      userId: v.optional(v.string()),
    })
  ),
});

// Ownership-agnostic lookup by row id — the consumer (e.g. deployWorkload)
// is the one that knows how to interpret `data` for its own sourceKey.
export const get = internalQuery({
  args: { id: v.id("selectOptions") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
  returns: v.union(
    v.object({
      _creationTime: v.number(),
      _id: v.id("selectOptions"),
      createdAt: v.number(),
      data: v.optional(v.any()),
      label: v.string(),
      sourceKey: v.string(),
      updatedAt: v.number(),
      userId: v.optional(v.string()),
    }),
    v.null()
  ),
});

import { v } from "convex/values";

import { internalQuery } from "../_generated/server";

const selectOptionDoc = v.object({
  _creationTime: v.number(),
  _id: v.id("selectOptions"),
  createdAt: v.number(),
  label: v.string(),
  sourceKey: v.string(),
  updatedAt: v.number(),
  userId: v.string(),
});

// Lists every option for one dynamic-select source that belongs to the
// requesting user — the options a dataSource.kind:"dynamic" catalog
// parameter offers. Scoped by userId so one user's saved options never
// appear in another user's dropdown (see convex/schema.ts). Bounded at 200
// for defense-in-depth/consistency with listByGroup above, even though no
// write path into this table exists yet.
export const listBySource = internalQuery({
  args: { sourceKey: v.string(), userId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("selectOptions")
      .withIndex("by_source_and_user", (q) =>
        q.eq("sourceKey", args.sourceKey).eq("userId", args.userId)
      )
      .take(200),
  returns: v.array(selectOptionDoc),
});

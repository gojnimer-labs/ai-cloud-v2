import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { selectOptionPayloadValidator } from "./validators";

const selectOptionDoc = v.object({
  _creationTime: v.number(),
  _id: v.id("selectOptions"),
  createdAt: v.number(),
  // Deprecated predecessor of `payload` — see convex/schema.ts.
  data: v.optional(v.any()),
  label: v.string(),
  payload: v.optional(selectOptionPayloadValidator),
  sourceKey: v.string(),
  updatedAt: v.number(),
  userId: v.string(),
});

// Lists every option for one dynamic-select source that belongs to the
// requesting user — the options a dataSource.kind:"dynamic" catalog
// parameter offers. Scoped by userId so one user's saved options never
// appear in another user's dropdown (see convex/schema.ts).
export const listBySource = internalQuery({
  args: { sourceKey: v.string(), userId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("selectOptions")
      .withIndex("by_source_and_user", (q) =>
        q.eq("sourceKey", args.sourceKey).eq("userId", args.userId)
      )
      .collect(),
  returns: v.array(selectOptionDoc),
});

// Lookup by row id, scoped to the requesting user — a foreign or
// nonexistent id both resolve to null identically, so a lookup never
// reveals whether an id merely doesn't exist vs. belongs to someone else.
export const get = internalQuery({
  args: { id: v.id("selectOptions"), userId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    return row && row.userId === args.userId ? row : null;
  },
  returns: v.union(selectOptionDoc, v.null()),
});

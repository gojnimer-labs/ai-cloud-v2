import { v } from "convex/values";

import { internalQuery } from "../_generated/server";

const fileDoc = v.object({
  _creationTime: v.number(),
  _id: v.id("files"),
  createdAt: v.number(),
  group: v.string(),
  label: v.string(),
  r2Bucket: v.string(),
  r2Key: v.string(),
  type: v.string(),
  userId: v.string(),
});

// Lists every file in one group that belongs to the requesting user — the
// options a dataSource.kind:"fileOptions" catalog parameter offers. Scoped
// by userId so one user's files never appear in another user's dropdown
// (see convex/schema.ts).
export const listByGroup = internalQuery({
  args: { group: v.string(), userId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("files")
      .withIndex("by_user_and_group", (q) =>
        q.eq("userId", args.userId).eq("group", args.group)
      )
      .collect(),
  returns: v.array(fileDoc),
});

// Lookup by row id, scoped to the requesting user — a foreign or
// nonexistent id both resolve to null identically, so a lookup never
// reveals whether an id merely doesn't exist vs. belongs to someone else.
export const get = internalQuery({
  args: { id: v.id("files"), userId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    return row && row.userId === args.userId ? row : null;
  },
  returns: v.union(fileDoc, v.null()),
});

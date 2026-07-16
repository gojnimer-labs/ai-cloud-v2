import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { selectOptionPayloadValidator } from "./validators";

// Records one option for a dynamic-select source (see convex/schema.ts).
// Generic on purpose: any future dataSource.kind:"dynamic" parameter reuses
// this same mutation, just with a different sourceKey/payload shape.
export const create = internalMutation({
  args: {
    createdAt: v.number(),
    label: v.string(),
    payload: selectOptionPayloadValidator,
    sourceKey: v.string(),
    updatedAt: v.number(),
    userId: v.string(),
  },
  handler: async (ctx, args) => await ctx.db.insert("selectOptions", args),
  returns: v.id("selectOptions"),
});

// Updates a row's label — backs the update_row additionalInfo directive
// (see workloads/actions.ts#runOperation). A foreign or nonexistent id is a
// silent no-op rather than a thrown error, matching queries.ts#get's
// ownership rule: a caller never learns whether an id merely doesn't exist
// vs. belongs to someone else.
export const patch = internalMutation({
  args: { id: v.id("selectOptions"), label: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== args.userId) {
      return null;
    }
    await ctx.db.patch(args.id, { label: args.label, updatedAt: Date.now() });
    return null;
  },
  returns: v.null(),
});

// Deletes a row — backs the remove_row additionalInfo directive (see
// workloads/actions.ts#runOperation). Same silent-no-op ownership rule as
// patch above.
export const remove = internalMutation({
  args: { id: v.id("selectOptions"), userId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== args.userId) {
      return null;
    }
    await ctx.db.delete(args.id);
    return null;
  },
  returns: v.null(),
});

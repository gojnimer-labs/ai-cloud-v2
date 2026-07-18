import { v } from "convex/values";

import { adminQuery } from "../functions";

const groupValidator = v.object({
  _id: v.id("groups"),
  createdAt: v.number(),
  name: v.string(),
});

export const listGroups = adminQuery({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db.query("groups").order("desc").take(200);
    return groups.map((group) => ({
      _id: group._id,
      createdAt: group.createdAt,
      name: group.name,
    }));
  },
  returns: v.array(groupValidator),
});

// Groups a given user belongs to — prefills the admin user detail panel's
// group selector for that user.
export const listGroupsForUser = adminQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(500);
    const groups = await Promise.all(
      memberships.map((membership) => ctx.db.get(membership.groupId))
    );
    return groups
      .filter((group): group is NonNullable<typeof group> => group !== null)
      .map((group) => ({
        _id: group._id,
        createdAt: group.createdAt,
        name: group.name,
      }));
  },
  returns: v.array(groupValidator),
});

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

// Every (group, user) membership at once, for the admin Users page's
// "Groups" column and its group-by-groups view — a bulk companion to
// listGroupsForUser above (which only ever looks up one user, the right
// shape for the user detail panel's own group selector, but an N+1 if
// called once per row here). Bounded rather than paginated, same
// "fleet overview, not infinite scroll" convention as listClusters/
// listFiles — the admin Users list itself is capped at 200 rows
// (see useAdminUsers), so membership rows are bounded well above that.
export const listGroupMemberships = adminQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db.query("groupMembers").take(2000);
    return memberships.map((membership) => ({
      groupId: membership.groupId,
      userId: membership.userId,
    }));
  },
  returns: v.array(v.object({ groupId: v.id("groups"), userId: v.string() })),
});

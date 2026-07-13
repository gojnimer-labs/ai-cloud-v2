import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

// Just long enough to complete the operator's verify round trip right after
// the browser navigates — the real session lives in the cookie the operator
// mints afterward (see ai-cloud-operator's requireGatewayToken), not in this
// token's own lifetime.
const ONE_TIME_TOKEN_TTL_MS = 60_000;

export const create = internalMutation({
  args: {
    name: v.string(),
    namespace: v.string(),
    tokenHash: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("gatewayTokens", {
      expiresAt: Date.now() + ONE_TIME_TOKEN_TTL_MS,
      name: args.name,
      namespace: args.namespace,
      tokenHash: args.tokenHash,
      userId: args.userId,
    }),
  returns: v.id("gatewayTokens"),
});

// Atomically checks and marks used — Convex mutations are transactional, so
// there's no race between the check and the usedAt write even under
// concurrent calls for the same token; a double-spend attempt always fails
// closed. Returns null (not an error) on any failure — unknown token,
// already used, expired, or scoped to a different namespace/name — so the
// caller can't distinguish those cases from the response alone.
export const consume = internalMutation({
  args: { name: v.string(), namespace: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("gatewayTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      !row ||
      row.usedAt !== undefined ||
      row.expiresAt < Date.now() ||
      row.namespace !== args.namespace ||
      row.name !== args.name
    ) {
      return null;
    }
    await ctx.db.patch(row._id, { usedAt: Date.now() });
    return { userId: row.userId };
  },
  returns: v.union(v.object({ userId: v.string() }), v.null()),
});

import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";

// Deliberately excludes heartbeatTokenHash/deployToken — safe for the
// dashboard/CLI to call without ever printing a live credential. Also
// excludes "pending" clusters (admin pre-created, never claimed by a real
// operator) — not functional deploy targets, no value showing them here.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").collect();
    return operators
      .filter(
        (
          operator
        ): operator is typeof operator & {
          healthStatus: "healthy" | "offline" | "ready_to_destroy";
        } => operator.healthStatus !== "pending"
      )
      .map((operator) => ({
        _id: operator._id,
        healthStatus: operator.healthStatus,
        lastHeartbeatAt: operator.lastHeartbeatAt,
        name: operator.name,
      }));
  },
  returns: v.array(
    v.object({
      _id: v.id("operators"),
      healthStatus: v.union(
        v.literal("healthy"),
        v.literal("offline"),
        v.literal("ready_to_destroy")
      ),
      lastHeartbeatAt: v.optional(v.number()),
      name: v.string(),
    })
  ),
});

export const getByHeartbeatTokenHash = internalQuery({
  args: { heartbeatTokenHash: v.string() },
  handler: async (ctx, args) => {
    const operator = await ctx.db
      .query("operators")
      .withIndex("by_heartbeatTokenHash", (q) =>
        q.eq("heartbeatTokenHash", args.heartbeatTokenHash)
      )
      .unique();
    return operator ? { _id: operator._id } : null;
  },
  returns: v.union(v.object({ _id: v.id("operators") }), v.null()),
});

// Returns just the operator's public URL — used by getWorkloadAccessToken,
// which mints a gateway token and never needs the live deployToken. Returns
// null for an unclaimed ("pending") operator, same as a missing row — it has
// no externalUrl yet either way.
export const getExternalUrl = internalQuery({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    return operator?.externalUrl ? { externalUrl: operator.externalUrl } : null;
  },
  returns: v.union(v.object({ externalUrl: v.string() }), v.null()),
});

// Returns only what's needed to call out to the operator's inbound API —
// deployToken is a live credential, so callers should not fetch or log the
// full operator document when this narrower shape will do. Returns null for
// an unclaimed ("pending") operator, which has neither field yet.
export const getForDeploy = internalQuery({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    if (!(operator?.deployToken && operator.externalUrl)) {
      return null;
    }
    return {
      deployToken: operator.deployToken,
      externalUrl: operator.externalUrl,
    };
  },
  returns: v.union(
    v.object({ deployToken: v.string(), externalUrl: v.string() }),
    v.null()
  ),
});

import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * 24 * ONE_HOUR_MS;

// Called on every POST /operators/register — both the initial claim and any
// later re-registration (the operator falls back to this whenever its
// persisted heartbeat token gets rejected). Looks up by the pre-created
// row's enrollmentTokenHash, never by name, so the operator's self-reported
// identity can never claim or rename a cluster it wasn't issued a token for.
export const claim = internalMutation({
  args: {
    deployToken: v.string(),
    enrollmentTokenHash: v.string(),
    externalUrl: v.string(),
    heartbeatTokenHash: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const operator = await ctx.db
      .query("operators")
      .withIndex("by_enrollmentTokenHash", (q) =>
        q.eq("enrollmentTokenHash", args.enrollmentTokenHash)
      )
      .unique();
    if (!operator) {
      return null;
    }
    await ctx.db.patch(operator._id, {
      claimedAt: operator.claimedAt ?? Date.now(),
      deployToken: args.deployToken,
      externalUrl: args.externalUrl,
      healthStatus: "healthy",
      heartbeatTokenHash: args.heartbeatTokenHash,
      lastHeartbeatAt: Date.now(),
      metadata: args.metadata,
    });
    return { operatorId: operator._id };
  },
  returns: v.union(v.object({ operatorId: v.id("operators") }), v.null()),
});

// Admin cleanup — e.g. removing a stale/test registration row. Internal
// only: never exposed to the browser (see convex/admin/mutations.ts's
// deleteCluster for the browser-facing equivalent).
export const remove = internalMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.operatorId);
    return null;
  },
  returns: v.null(),
});

// Returns the operator's own tags so the caller (operators/http.ts's
// heartbeat route) can immediately turn around and use them for
// listClaimable — one round trip instead of a heartbeat write followed by a
// separate read of the row it just wrote.
export const markHeartbeat = internalMutation({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.operatorId, {
      healthStatus: "healthy",
      lastHeartbeatAt: Date.now(),
    });
    const operator = await ctx.db.get(args.operatorId);
    return { tags: operator?.tags ?? [] };
  },
  returns: v.object({ tags: v.array(v.string()) }),
});

const computeHealthStatus = (
  referenceAt: number,
  retentionPolicy: "standard" | "retain"
): "healthy" | "offline" | "ready_to_destroy" => {
  const age = Date.now() - referenceAt;
  if (age <= ONE_HOUR_MS) {
    return "healthy";
  }
  if (age <= ONE_WEEK_MS || retentionPolicy === "retain") {
    return "offline";
  }
  return "ready_to_destroy";
};

// Cron target (see convex/crons.ts). Sweeps every claimed operator and
// recomputes healthStatus from time since last signal. Idempotent — only
// patches rows whose computed status actually differs — and skips "pending"
// rows entirely; those stay pending until claim() fires.
export const promoteHealthStatuses = internalMutation({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").take(500);
    const patches = operators.flatMap((operator) => {
      if (operator.healthStatus === "pending") {
        return [];
      }
      const referenceAt = operator.lastHeartbeatAt ?? operator.claimedAt;
      if (referenceAt === undefined) {
        return [];
      }
      const target = computeHealthStatus(referenceAt, operator.retentionPolicy);
      if (target === operator.healthStatus) {
        return [];
      }
      return [ctx.db.patch(operator._id, { healthStatus: target })];
    });
    await Promise.all(patches);
    return null;
  },
  returns: v.null(),
});

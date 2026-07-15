import { v } from "convex/values";

import { query } from "../_generated/server";
import { authComponent, requireAdminUser } from "../auth";

const clusterWorkloadValidator = v.object({
  _id: v.id("workloads"),
  createdAt: v.number(),
  name: v.string(),
  namespace: v.string(),
  templateId: v.string(),
  userEmail: v.string(),
});

// Admin-only fleet overview: every cluster (operator) with its workloads,
// owner emails resolved from the Better Auth user table. Bounded rather than
// paginated — this is a fleet overview, not something meant to scroll
// through thousands of rows.
export const listClusters = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminUser(ctx);

    const operators = await ctx.db.query("operators").take(200);
    const workloads = await ctx.db.query("workloads").take(1000);

    const userIds = [...new Set(workloads.map((workload) => workload.userId))];
    const users = await Promise.all(
      userIds.map((userId) => authComponent.getAnyUserById(ctx, userId))
    );
    const emailByUserId = new Map(
      userIds.map((userId, index) => [userId, users[index]?.email ?? userId])
    );

    return operators.map((operator) => ({
      _id: operator._id,
      claimedAt: operator.claimedAt,
      description: operator.description,
      healthStatus: operator.healthStatus,
      lastHeartbeatAt: operator.lastHeartbeatAt,
      name: operator.name,
      region: operator.region,
      retentionPolicy: operator.retentionPolicy,
      tags: operator.tags ?? [],
      workloads: workloads
        .filter((workload) => workload.operatorId === operator._id)
        .map((workload) => ({
          _id: workload._id,
          createdAt: workload.createdAt,
          name: workload.name,
          namespace: workload.namespace,
          templateId: workload.templateId,
          userEmail: emailByUserId.get(workload.userId) ?? workload.userId,
        })),
    }));
  },
  returns: v.array(
    v.object({
      _id: v.id("operators"),
      claimedAt: v.optional(v.number()),
      description: v.optional(v.string()),
      healthStatus: v.union(
        v.literal("pending"),
        v.literal("healthy"),
        v.literal("offline"),
        v.literal("ready_to_destroy")
      ),
      lastHeartbeatAt: v.optional(v.number()),
      name: v.string(),
      region: v.optional(v.string()),
      retentionPolicy: v.union(v.literal("standard"), v.literal("retain")),
      tags: v.array(v.string()),
      workloads: v.array(clusterWorkloadValidator),
    })
  ),
});

import { v } from "convex/values";

import { internalQuery, query } from "../_generated/server";
import { authComponent } from "../auth";
import { matchesTags } from "../operators/tagMatch";
import { workloadStatusValidator } from "../schema";

export const workloadRowValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("workloads"),
  config: v.optional(v.any()),
  createdAt: v.number(),
  desiredOperatorTags: v.array(v.string()),
  displayName: v.string(),
  failureReason: v.optional(v.string()),
  name: v.optional(v.string()),
  namespace: v.optional(v.string()),
  operatorId: v.optional(v.id("operators")),
  status: workloadStatusValidator,
  subdomain: v.optional(v.string()),
  templateId: v.string(),
  templateVersion: v.optional(v.string()),
  userId: v.string(),
});

// Public and reactive, unlike workloads/actions.ts#listMyWorkloads (an
// action, since live phase/readyReplicas needs a fetch to the operator).
// This only ever reflects the `workloads` table itself, so a request/claim/
// upsert/destroy shows up here the moment the corresponding mutation lands,
// without waiting on any client-side poll interval.
//
// Excludes `status === "destroyed"` rows by default — rows in
// `requested_destroy`/`destroying` still show (with a status badge) until
// they flip to `destroyed`. Reads a bounded buffer larger than the returned
// page so filtering out destroyed rows doesn't shrink a full page below 50
// just because some of the most-recent 50 happen to be destroyed.
export const listOwned = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      return [];
    }
    const rows = await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(100);
    return rows.filter((row) => row.status !== "destroyed").slice(0, 50);
  },
  returns: v.array(workloadRowValidator),
});

// Excludes `status === "destroyed"` rows, same as listOwned above — the two
// are different surfaces (reactive query vs. the action-layer
// listMyWorkloads) over the same ownership data and must agree on what
// counts as "yours" to show, or a workload could appear/disappear depending
// on which one a given piece of UI happens to call.
export const listByUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);
    return rows.filter((row) => row.status !== "destroyed").slice(0, 50);
  },
  returns: v.array(workloadRowValidator),
});

// Ownership-checked lookup by row id — returns null (not an error) on
// mismatch or missing row, so a non-owner can't distinguish "doesn't exist"
// from "not yours."
export const getOwned = internalQuery({
  args: { userId: v.string(), workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row || row.userId !== args.userId) {
      return null;
    }
    return row;
  },
  returns: v.union(workloadRowValidator, v.null()),
});

// Called from operators/http.ts's heartbeat route with the calling
// operator's own tags. Returns only what a claim call needs to pick a
// target — never the full row (config may be arbitrarily large/sensitive).
export const listClaimable = internalQuery({
  args: { operatorTags: v.array(v.string()) },
  handler: async (ctx, args) => {
    const requested = await ctx.db
      .query("workloads")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .take(20);
    return requested
      .filter((row) => matchesTags(args.operatorTags, row.desiredOperatorTags))
      .map((row) => ({ templateId: row.templateId, workloadId: row._id }));
  },
  returns: v.array(
    v.object({ templateId: v.string(), workloadId: v.id("workloads") })
  ),
});

// Called from operators/http.ts's heartbeat route, scoped to the calling
// operator — destroy/redeploy never need a tag check, since the workload is
// already assigned to this operator by the time either status appears.
export const listPendingOperations = internalQuery({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const destroying = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_status", (q) =>
        q.eq("operatorId", args.operatorId).eq("status", "requested_destroy")
      )
      .take(20);
    const redeploying = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_status", (q) =>
        q.eq("operatorId", args.operatorId).eq("status", "requested_redeploy")
      )
      .take(20);
    return [
      ...destroying.map((row) => ({
        operation: "destroy" as const,
        workloadId: row._id,
      })),
      ...redeploying.map((row) => ({
        operation: "redeploy" as const,
        workloadId: row._id,
      })),
    ];
  },
  returns: v.array(
    v.object({
      operation: v.union(v.literal("destroy"), v.literal("redeploy")),
      workloadId: v.id("workloads"),
    })
  ),
});

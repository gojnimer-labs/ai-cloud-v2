import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { authedQuery } from "../functions";
import { supportsTemplateVersion } from "../operators/catalogMatch";
import { matchesTags } from "../operators/tagMatch";
import { workloadStatusValidator } from "../schema";

export const workloadRowValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("workloads"),
  claimAttempts: v.optional(
    v.array(
      v.object({
        claimedAt: v.number(),
        operatorId: v.id("operators"),
        times: v.number(),
      })
    )
  ),
  config: v.optional(v.any()),
  createdAt: v.number(),
  desiredOperatorTags: v.array(v.string()),
  displayName: v.string(),
  failureReason: v.optional(v.string()),
  leaseExpiresAt: v.optional(v.number()),
  name: v.optional(v.string()),
  namespace: v.optional(v.string()),
  operatorId: v.optional(v.id("operators")),
  status: workloadStatusValidator,
  subdomain: v.optional(v.string()),
  templateId: v.string(),
  templateVersion: v.optional(v.string()),
  userId: v.string(),
});

// The Workspace page's "my deployments" data source — every workload the
// calling user owns, most recent first, live-updating as claim/heartbeat
// moves status through requested -> provisioning -> active. Bounded rather
// than paginated, same "personal list, not infinite scroll" convention as
// the rest of this app's owner-facing surfaces. A lean, dedicated shape
// rather than the full workloadRowValidator — Workspace only ever renders
// name/status/source, never config or claim internals.
export const listMine = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      _id: row._id,
      createdAt: row.createdAt,
      displayName: row.displayName,
      sourcePresetId: row.sourcePresetId,
      status: row.status,
      templateId: row.templateId,
    }));
  },
  returns: v.array(
    v.object({
      _id: v.id("workloads"),
      createdAt: v.number(),
      displayName: v.string(),
      sourcePresetId: v.optional(v.id("presets")),
      status: workloadStatusValidator,
      templateId: v.string(),
    })
  ),
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

// Unscoped lookup by row id — no userId check, unlike getOwned above. Only
// for admin-only callers (see the admin-facing mutations in
// workloads/mutations.ts and actions in workloads/actions.ts) that
// intentionally act across every user's workloads, never exposed to a
// user-scoped caller.
export const getById = internalQuery({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => await ctx.db.get(args.workloadId),
  returns: v.union(workloadRowValidator, v.null()),
});

// Called from operators/http.ts's gateway/verify route after the one-time
// token itself has already proven identity (see convex/auth.ts's
// oneTimeToken plugin) — this re-checks that the resulting userId still
// owns an `active` workload at this exact (operatorId, name, namespace),
// closing the gap between when the token was minted and when it's
// consumed. Returns null (not an error) on any mismatch, same
// indistinguishable-failure-modes reasoning as getOwned above.
export const getActiveForOperator = internalQuery({
  args: {
    name: v.string(),
    namespace: v.string(),
    operatorId: v.id("operators"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_name", (q) =>
        q.eq("operatorId", args.operatorId).eq("name", args.name)
      )
      .unique();
    if (
      !row ||
      row.namespace !== args.namespace ||
      row.userId !== args.userId ||
      row.status !== "active"
    ) {
      return null;
    }
    return row;
  },
  returns: v.union(workloadRowValidator, v.null()),
});

// Admin-bypass mirror of getActiveForOperator above — deliberately drops
// the userId match: called from operators/http.ts's gateway/verify route
// only once that route has already confirmed the token's holder is an
// admin (a role check made there, against the verified token's own user
// record, not here), so an admin can open any active workload on this
// operator, not just one they happen to own.
export const getActiveForAdmin = internalQuery({
  args: {
    name: v.string(),
    namespace: v.string(),
    operatorId: v.id("operators"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_name", (q) =>
        q.eq("operatorId", args.operatorId).eq("name", args.name)
      )
      .unique();
    if (!row || row.namespace !== args.namespace || row.status !== "active") {
      return null;
    }
    return row;
  },
  returns: v.union(workloadRowValidator, v.null()),
});

// Called from operators/http.ts's heartbeat route with the calling
// operator's own id — loads the operator itself (rather than being handed
// pre-fetched tags) so it can filter on both tags AND the operator's own
// reported catalog, closing the version-drift gap: two tag-matching
// operators serving different versions of the same templateId no longer
// both look claimable to a request pinned to one specific version. Returns
// only what a claim call needs to pick a target — never the full row
// (config may be arbitrarily large/sensitive).
export const listClaimable = internalQuery({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    if (!operator) {
      return [];
    }
    const requested = await ctx.db
      .query("workloads")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .take(20);
    return requested
      .filter((row) => matchesTags(operator.tags, row.desiredOperatorTags))
      .filter((row) =>
        supportsTemplateVersion(
          operator.catalog,
          row.templateId,
          row.templateVersion
        )
      )
      .map((row) => ({ templateId: row.templateId, workloadId: row._id }));
  },
  returns: v.array(
    v.object({ templateId: v.string(), workloadId: v.id("workloads") })
  ),
});

// Called from operators/http.ts's heartbeat route, scoped to the calling
// operator — destroy/redeploy/stop/resume never need a tag check, since the
// workload is already assigned to this operator by the time any of these
// statuses appears.
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
    const stopping = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_status", (q) =>
        q.eq("operatorId", args.operatorId).eq("status", "requested_stop")
      )
      .take(20);
    const resuming = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_status", (q) =>
        q.eq("operatorId", args.operatorId).eq("status", "requested_resume")
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
      ...stopping.map((row) => ({
        operation: "stop" as const,
        workloadId: row._id,
      })),
      ...resuming.map((row) => ({
        operation: "resume" as const,
        workloadId: row._id,
      })),
    ];
  },
  returns: v.array(
    v.object({
      operation: v.union(
        v.literal("destroy"),
        v.literal("redeploy"),
        v.literal("stop"),
        v.literal("resume")
      ),
      workloadId: v.id("workloads"),
    })
  ),
});

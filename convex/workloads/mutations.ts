import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

// Records ownership of a workload. Called from convex/operators/http.ts's
// upsertWorkload route — the operator's reconciler reports this after every
// spec-changing reconcile of a Workload CR, so the row stays in sync with
// the cluster automatically (including workloads created directly with
// kubectl, bypassing Convex's deploy action entirely). No status field:
// live status is always fetched from the operator on demand (see
// workloads/actions.ts#listMyWorkloads) — never mirrored here.
//
// Known POC-level gap: on conflict (same operatorId+name redeployed by a
// different user), this keeps the ORIGINAL row's userId rather than erroring
// or reassigning — ownership can't be silently hijacked, but a name
// collision from a different user isn't surfaced either. Callers should use
// unique names per deploy to avoid this.
export const record = internalMutation({
  args: {
    name: v.string(),
    namespace: v.string(),
    operatorId: v.id("operators"),
    subdomain: v.optional(v.string()),
    templateId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_name", (q) =>
        q.eq("operatorId", args.operatorId).eq("name", args.name)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        namespace: args.namespace,
        subdomain: args.subdomain,
        templateId: args.templateId,
      });
      return existing._id;
    }

    return await ctx.db.insert("workloads", {
      createdAt: Date.now(),
      name: args.name,
      namespace: args.namespace,
      operatorId: args.operatorId,
      subdomain: args.subdomain,
      templateId: args.templateId,
      userId: args.userId,
    });
  },
  returns: v.id("workloads"),
});

// Admin cleanup by row id — for ad hoc fixes. Internal only.
export const remove = internalMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.workloadId);
    return null;
  },
  returns: v.null(),
});

// Called from convex/operators/http.ts's removeWorkload route when the
// reconciler observes a Workload CR is gone. No-op (not an error) if the row
// was already removed or never existed — the operator can't easily tell
// the difference and shouldn't need to.
export const removeByOperatorAndName = internalMutation({
  args: { name: v.string(), operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_name", (q) =>
        q.eq("operatorId", args.operatorId).eq("name", args.name)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
  returns: v.null(),
});

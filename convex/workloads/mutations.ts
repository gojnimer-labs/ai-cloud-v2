import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { matchesTags } from "../operators/tagMatch";

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

// Public-facing request lifecycle. Called only from workloads/actions.ts
// (requestWorkload) after auth + operator/template resolution, so `userId`
// arrives already-verified server-side — same convention as e.g.
// files/mutations.ts#create, never trusted directly from a browser caller.
export const requestCreate = internalMutation({
  args: {
    config: v.any(),
    desiredOperatorTags: v.array(v.string()),
    displayName: v.optional(v.string()),
    templateId: v.string(),
    templateVersion: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    let displayName = args.displayName?.trim();

    if (displayName) {
      const clash = await ctx.db
        .query("workloads")
        .withIndex("by_user_and_display_name", (q) =>
          q.eq("userId", args.userId).eq("displayName", displayName as string)
        )
        .unique();
      if (clash) {
        throw new Error(`You already have a workload named "${displayName}"`);
      }
    } else {
      // Backend fallback when the frontend leaves displayName blank — a
      // real "suggest a friendly name" UX is Part C's job; this is just a
      // safety net so requestCreate never inserts an unlabeled row. Generates
      // several candidates up front and checks them all in parallel (rather
      // than a sequential retry loop) — a genuine collision on all 5 is
      // astronomically unlikely; if it happens, the caller gets a clear
      // error rather than an infinite/silent retry.
      const candidates = Array.from(
        { length: 5 },
        () => `${args.templateId}-${randomSuffix()}`
      );
      const clashes = await Promise.all(
        candidates.map((candidate) =>
          ctx.db
            .query("workloads")
            .withIndex("by_user_and_display_name", (q) =>
              q.eq("userId", args.userId).eq("displayName", candidate)
            )
            .unique()
        )
      );
      const available = candidates.find((_candidate, index) => !clashes[index]);
      if (!available) {
        throw new Error(
          "Could not generate a unique workload name — please provide one"
        );
      }
      displayName = available;
    }

    return await ctx.db.insert("workloads", {
      config: args.config,
      createdAt: Date.now(),
      desiredOperatorTags: args.desiredOperatorTags,
      displayName,
      status: "requested",
      templateId: args.templateId,
      templateVersion: args.templateVersion,
      userId: args.userId,
    });
  },
  returns: v.id("workloads"),
});

// Create-only claim, called from operators/http.ts's
// POST /operators/workloads/claim (piggybacking on the heartbeat's
// listClaimable result). Does NOT mint a k8s-safe name — that still comes
// from the cluster's own GenerateName, reported back later via `record`.
// Returns null on any race/staleness (already claimed since listClaimable
// ran, or the operator's tags no longer match) — callers treat null as
// "skip this one, try the next heartbeat."
export const claim = internalMutation({
  args: { operatorId: v.id("operators"), workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row || row.status !== "requested") {
      return null;
    }
    const operator = await ctx.db.get(args.operatorId);
    if (!operator) {
      return null;
    }
    // Staleness guard: the operator's tags may have changed between the
    // heartbeat's listClaimable snapshot and this claim call.
    if (!matchesTags(operator.tags, row.desiredOperatorTags)) {
      return null;
    }

    await ctx.db.patch(row._id, {
      operatorId: args.operatorId,
      status: "provisioning",
    });

    return {
      config: row.config,
      subdomain: row.subdomain,
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      userId: row.userId,
      workloadId: row._id,
    };
  },
  returns: v.union(
    v.object({
      config: v.optional(v.any()),
      subdomain: v.optional(v.string()),
      templateId: v.string(),
      templateVersion: v.optional(v.string()),
      userId: v.string(),
      workloadId: v.id("workloads"),
    }),
    v.null()
  ),
});

// Called from workloads/actions.ts#requestRemoval, after that action has
// already confirmed ownership via getOwned — mirrors the existing
// convention where an ownership-checked action passes on only the row's own
// fields to internal calls, never re-passing userId for a second check.
export const requestDestroy = internalMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row) {
      throw new Error("Workload not found");
    }
    // Reachable from `active` (the common case) or `stopped` (an admin
    // permanently cleaning up a banned user's paused workload without
    // resuming it first) — both transition straight to `requested_destroy`,
    // no special-casing needed at claim time since the claimed destroy path
    // already just deletes the CR regardless of current replica count.
    if (row.status === "active" || row.status === "stopped") {
      await ctx.db.patch(row._id, { status: "requested_destroy" });
      return null;
    }
    // A `failed` row with no `name` never got a live CR (the create attempt
    // itself failed) — nothing for an operator to tear down, so this is a
    // direct soft-delete rather than a claimable operation. A `failed` row
    // that DOES have a `name` still has a live CR (see reportLifecycle) and
    // should never reach `failed` in the first place — defensive fallthrough
    // to the same error below.
    if (row.status === "failed" && !row.name) {
      await ctx.db.patch(row._id, { status: "destroyed" });
      return null;
    }
    throw new Error(`Cannot destroy a workload with status "${row.status}"`);
  },
  returns: v.null(),
});

// Called from workloads/actions.ts#requestStopAction, same
// already-ownership-checked convention as requestDestroy. Scale-to-0 pause —
// keeps the CR/Service in place (see the plan's "Unified status model");
// only reachable from `active`.
export const requestStop = internalMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row) {
      throw new Error("Workload not found");
    }
    if (row.status !== "active") {
      throw new Error(`Cannot stop a workload with status "${row.status}"`);
    }
    await ctx.db.patch(row._id, { status: "requested_stop" });
    return null;
  },
  returns: v.null(),
});

// Called from workloads/actions.ts#requestResumeAction, same convention.
// Only reachable from `stopped` — the mirror of requestStop.
export const requestResume = internalMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row) {
      throw new Error("Workload not found");
    }
    if (row.status !== "stopped") {
      throw new Error(`Cannot resume a workload with status "${row.status}"`);
    }
    await ctx.db.patch(row._id, { status: "requested_resume" });
    return null;
  },
  returns: v.null(),
});

// Called from workloads/actions.ts#requestRedeployAction, same
// already-ownership-checked convention as requestDestroy. Leaves
// name/displayName/operatorId untouched — redeploy never moves a workload
// to a different operator.
export const requestRedeploy = internalMutation({
  args: {
    config: v.any(),
    templateVersion: v.string(),
    workloadId: v.id("workloads"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row) {
      throw new Error("Workload not found");
    }
    if (row.status !== "active") {
      throw new Error(`Cannot redeploy a workload with status "${row.status}"`);
    }
    await ctx.db.patch(row._id, {
      config: args.config,
      status: "requested_redeploy",
      templateVersion: args.templateVersion,
    });
    return null;
  },
  returns: v.null(),
});

// Generic claim for an operation on an ALREADY-ASSIGNED workload (destroy,
// redeploy, stop, or resume) — called from operators/http.ts's
// POST /operators/workloads/claim-operation. No tag check: the operator is
// already fixed from create time, this just confirms it's the same one and
// the row is still in the expected in-flight state. Returns null on any
// race (already claimed by a concurrent heartbeat tick) or mismatch.
// stop/resume never touch config/templateId/templateVersion — they're a
// pure replica-count flip on the existing CR, nothing about the workload's
// spec changes.
export const claimOperation = internalMutation({
  args: { operatorId: v.id("operators"), workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row || row.operatorId !== args.operatorId) {
      return null;
    }
    if (
      row.status !== "requested_destroy" &&
      row.status !== "requested_redeploy" &&
      row.status !== "requested_stop" &&
      row.status !== "requested_resume"
    ) {
      return null;
    }
    // An already-assigned row always has a real name/namespace from its
    // create-time upsert — defensive null-check only, should never trip.
    if (!row.name || !row.namespace) {
      return null;
    }

    if (row.status === "requested_destroy") {
      await ctx.db.patch(row._id, { status: "destroying" });
      return {
        name: row.name,
        namespace: row.namespace,
        operation: "destroy" as const,
      };
    }

    if (row.status === "requested_redeploy") {
      await ctx.db.patch(row._id, { status: "redeploying" });
      return {
        config: row.config,
        name: row.name,
        namespace: row.namespace,
        operation: "redeploy" as const,
        templateId: row.templateId,
        templateVersion: row.templateVersion,
      };
    }

    if (row.status === "requested_stop") {
      await ctx.db.patch(row._id, { status: "stopping" });
      return {
        name: row.name,
        namespace: row.namespace,
        operation: "stop" as const,
      };
    }

    await ctx.db.patch(row._id, { status: "resuming" });
    return {
      name: row.name,
      namespace: row.namespace,
      operation: "resume" as const,
    };
  },
  returns: v.union(
    v.object({
      name: v.string(),
      namespace: v.string(),
      operation: v.literal("destroy"),
    }),
    v.object({
      config: v.optional(v.any()),
      name: v.string(),
      namespace: v.string(),
      operation: v.literal("redeploy"),
      templateId: v.string(),
      templateVersion: v.optional(v.string()),
    }),
    v.object({
      name: v.string(),
      namespace: v.string(),
      operation: v.union(v.literal("stop"), v.literal("resume")),
    }),
    v.null()
  ),
});

// Records ownership of a workload. Called from convex/operators/http.ts's
// upsertWorkload route — the operator's reconciler reports this after every
// spec-changing reconcile of a Workload CR, so the row stays in sync with
// the cluster automatically (including workloads created directly with
// kubectl, bypassing Convex's request flow entirely).
//
// Generalized for the claim architecture: `workloadId` (read from the CR's
// `apps.aicloud.dev/workload-id` label, present only for CRs created via the
// claim flow) is the correlation token handed to the operator at claim time
// — when present, this is what turns a `provisioning`/`redeploying` row
// into one with a real `name` for the first time, via a direct `_id`
// lookup. When absent (a legacy/manual CR with no such label), this falls
// back to today's `(operatorId, name)`-keyed upsert behavior unchanged.
//
// Known POC-level gap (unchanged from before): on a legacy-path conflict
// (same operatorId+name redeployed by a different user), this keeps the
// ORIGINAL row's userId rather than erroring or reassigning.
export const record = internalMutation({
  args: {
    name: v.string(),
    namespace: v.string(),
    operatorId: v.id("operators"),
    subdomain: v.optional(v.string()),
    templateId: v.string(),
    userId: v.string(),
    workloadId: v.optional(v.id("workloads")),
  },
  handler: async (ctx, args) => {
    if (args.workloadId) {
      const row = await ctx.db.get(args.workloadId);
      if (row) {
        await ctx.db.patch(row._id, {
          name: args.name,
          namespace: args.namespace,
          operatorId: args.operatorId,
          subdomain: args.subdomain,
        });
        return row._id;
      }
      // Falls through to the legacy lookup below — a labeled row that
      // somehow no longer exists shouldn't crash the reconciler's report
      // call, and the (operatorId, name) fallback is a reasonable recovery.
    }

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

    // Legacy/manual path: a kubectl-created CR with no Convex request
    // behind it at all, and no prior row either. This is the only place
    // left that inserts an already-`active` row outside the request/claim
    // flow — displayName is required, so it falls back to the real k8s
    // name (the only human-facing identity a manual CR has).
    return await ctx.db.insert("workloads", {
      createdAt: Date.now(),
      desiredOperatorTags: [],
      displayName: args.name,
      name: args.name,
      namespace: args.namespace,
      operatorId: args.operatorId,
      status: "active",
      subdomain: args.subdomain,
      templateId: args.templateId,
      userId: args.userId,
    });
  },
  returns: v.id("workloads"),
});

// Resolves the target status for a lifecycle report against the row's
// current in-flight status. `active`/`stopped` reports are always a
// straightforward success signal (for provisioning/redeploying/resuming, and
// stopping, respectively). A `failed` report's fallback target depends on
// WHICH in-flight status is being resolved, not just whether a live CR
// exists — generalizing the old two-way `hasLiveCr` check one step further:
//   - `provisioning` with no `name` yet: no CR ever came into existence (a
//     fresh create-claim that never got that far) — genuinely terminal,
//     nothing to reconcile, the row stays dismissable via requestDestroy.
//   - `provisioning` with a `name`, or `redeploying`, or `stopping`: a live
//     CR already exists and is still running (the stop attempt didn't take,
//     for `stopping`) — forcing a terminal `failed` here would hide an
//     otherwise-fine/running workload from the active view, so it goes back
//     to `active` with `failureReason` surfaced as a warning instead.
//   - `resuming`: the resume attempt didn't take — falls back to `stopped`
//     (still parked), not `active`.
const resolveLifecycleStatus = (
  phase: "active" | "failed" | "stopped",
  row: Doc<"workloads">
): "active" | "failed" | "stopped" => {
  if (phase !== "failed") {
    return phase;
  }
  if (row.status === "resuming") {
    return "stopped";
  }
  if (row.status === "provisioning" && !row.name) {
    return "failed";
  }
  return "active";
};

// Generalized from a create-only report: transitions FROM `provisioning`,
// `redeploying`, `stopping`, OR `resuming` TO `active`/`failed`/`stopped`.
//
// Resolves by `workloadId` when present, falling back to `(operatorId,
// name)` otherwise — mirrors `record`'s dual-path lookup. `workloadId` is
// required for a fresh create-claim failure: Create() erroring means no CR
// (and so no k8s `name`) ever came into existence, so `(operatorId, name)`
// has nothing to match against. Every other caller (redeploy/stop/resume
// failure, the reconciler's active/failed/stopped reports for an
// already-created CR) has a real `name` too and may pass either.
//
// Returns `"updated" | "unmatched" | "stale"` rather than always
// succeeding — a prior version always returned null/200 regardless of
// outcome (matching claim/claim-operation's "safe to call unconditionally"
// framing), but that meant ANY transient mismatch at report time (a race,
// a bug, anything) got silently swallowed with no way for the operator to
// ever notice or retry, since the HTTP route always reported success. A
// row genuinely observed live stuck in "resuming" forever this way. Now:
// - "unmatched" (no row found by either key, or found but a different
//   operator's) is still a legitimate, PERMANENT no-op — a manual/legacy
//   CR with no Convex row behind it at all will hit this on every single
//   reconcile forever, so it must stay a 200/non-retriable outcome or
//   every manual CR would reconcile-loop indefinitely (see http.ts).
// - "stale" (a matching row for this exact operator exists, but isn't in
//   one of the 4 in-flight statuses right now) is the suspicious case —
//   this operator legitimately owns this workload and expected to move it
//   forward, so http.ts maps this to a retriable error instead of 200.
//
// See resolveLifecycleStatus above for exactly how "failed" is reinterpreted
// per in-flight status.
export const reportLifecycle = internalMutation({
  args: {
    name: v.optional(v.string()),
    operatorId: v.id("operators"),
    phase: v.union(
      v.literal("active"),
      v.literal("failed"),
      v.literal("stopped")
    ),
    reason: v.optional(v.string()),
    workloadId: v.optional(v.id("workloads")),
  },
  handler: async (ctx, args) => {
    let row = null;
    if (args.workloadId) {
      row = await ctx.db.get(args.workloadId);
    } else if (args.name) {
      const { name } = args;
      row = await ctx.db
        .query("workloads")
        .withIndex("by_operator_and_name", (q) =>
          q.eq("operatorId", args.operatorId).eq("name", name)
        )
        .unique();
    }
    if (!row || row.operatorId !== args.operatorId) {
      return "unmatched";
    }
    if (
      row.status !== "provisioning" &&
      row.status !== "redeploying" &&
      row.status !== "stopping" &&
      row.status !== "resuming"
    ) {
      return "stale";
    }

    const status = resolveLifecycleStatus(args.phase, row);

    await ctx.db.patch(row._id, {
      failureReason: args.phase === "failed" ? args.reason : undefined,
      status,
    });
    return "updated";
  },
  returns: v.union(
    v.literal("updated"),
    v.literal("unmatched"),
    v.literal("stale")
  ),
});

// Generalized from the former `removeByOperatorAndName` — now a soft-delete
// (patches `status: "destroyed"`, never `ctx.db.delete`) so the row survives
// for history/audit. No-op if already `destroyed`; otherwise patches from
// *any* other status, deliberately also covering a CR deleted out-of-band
// (kubectl) on a row Convex still thinks is `active`.
export const reportDestroyed = internalMutation({
  args: { name: v.string(), operatorId: v.id("operators") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workloads")
      .withIndex("by_operator_and_name", (q) =>
        q.eq("operatorId", args.operatorId).eq("name", args.name)
      )
      .unique();
    if (!row || row.status === "destroyed") {
      return null;
    }
    await ctx.db.patch(row._id, { status: "destroyed" });
    return null;
  },
  returns: v.null(),
});

// Admin cleanup by row id — for ad hoc fixes. Internal only. Unlike
// reportDestroyed, this is a real hard delete — reserved for genuinely
// erroneous rows an admin wants gone entirely, not the normal destroy flow.
export const remove = internalMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.workloadId);
    return null;
  },
  returns: v.null(),
});

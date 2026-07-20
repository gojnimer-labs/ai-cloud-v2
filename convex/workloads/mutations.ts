import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { authComponent, createAuth } from "../auth";
import { adminMutation } from "../functions";
import { supportsTemplateVersion } from "../operators/catalogMatch";
import { matchesTags } from "../operators/tagMatch";

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;
// 5 lease cycles x 10min = up to ~50min retry runway before a stuck/failing
// claim goes terminal — matches the existing maxClaimsPerTick/
// maxPendingOperationsPerTick "5" convention on the operator side.
const MAX_CLAIM_ATTEMPTS = 5;

interface ClaimAttempt {
  claimedAt: number;
  operatorId: Id<"operators">;
  times: number;
}

// Called ONLY by releaseClaim, at the moment a hold ends (failure/timeout) —
// increments the RELEASING operator's own entry (or creates one). claim/
// claimOperation never call this: they only READ the sum via totalAttempts
// to decide whether another attempt is still allowed. Keeping the write and
// the read in different places means the terminal decision lives in exactly
// one spot (claim/claimOperation), not duplicated between claim and release.
const recordClaimAttempt = (
  existing: ClaimAttempt[] | undefined,
  operatorId: Id<"operators">
): ClaimAttempt[] => {
  const list = existing ?? [];
  const idx = list.findIndex((entry) => entry.operatorId === operatorId);
  const now = Date.now();
  if (idx === -1) {
    return [...list, { claimedAt: now, operatorId, times: 1 }];
  }
  return list.map((entry, i) =>
    i === idx ? { ...entry, claimedAt: now, times: entry.times + 1 } : entry
  );
};

const totalAttempts = (list: ClaimAttempt[] | undefined): number =>
  (list ?? []).reduce((sum, entry) => sum + entry.times, 0);

const terminalFallbackForExhausted = (
  requestedStatus:
    | "requested_destroy"
    | "requested_redeploy"
    | "requested_resume"
    | "requested_stop"
): { failureReason: string; status: "active" | "failed" | "stopped" } => {
  if (requestedStatus === "requested_destroy") {
    return {
      failureReason: `destroy did not complete after ${MAX_CLAIM_ATTEMPTS} attempts; manual cleanup required`,
      status: "failed",
    };
  }
  if (requestedStatus === "requested_resume") {
    return {
      failureReason: `resume did not complete after ${MAX_CLAIM_ATTEMPTS} attempts`,
      status: "stopped",
    };
  }
  return {
    failureReason: `${requestedStatus} did not complete after ${MAX_CLAIM_ATTEMPTS} attempts`,
    status: "active",
  };
};

// Called whenever an in-flight claim ends in failure, a lease timeout, or a
// known-dead owning operator (see reportLifecycle and sweepStaleClaims).
// ALWAYS releases back to a queued state — so a future claim/claimOperation
// call, by this operator or another, can pick it up — and records this hold
// as one more attempt against the RELEASING operator's own ledger entry.
// Deliberately never decides terminal itself: see claim/claimOperation below
// for where the ledger is actually read and acted on. The one exception is
// `provisioning`-with-a-name — no claim call is ever made again for a row
// whose create already succeeded (recovery is purely the same operator's own
// reconcile-and-report loop), so that branch has nothing to defer to and
// must resolve itself here.
const releaseClaim = async (
  ctx: MutationCtx,
  row: Doc<"workloads">,
  operatorOffline: boolean
): Promise<void> => {
  const hasName = Boolean(row.name);
  const claimAttempts = row.operatorId
    ? recordClaimAttempt(row.claimAttempts, row.operatorId)
    : row.claimAttempts;

  if (row.status === "provisioning" && !hasName) {
    // Fresh create, no CR yet — fully re-open to ANY tag-matching operator.
    await ctx.db.patch(row._id, {
      claimAttempts,
      leaseExpiresAt: undefined,
      operatorId: undefined,
      status: "requested",
    });
    return;
  }

  if (row.status === "destroying") {
    // No safe non-retry resting state exists — always retry via the SAME
    // operator (only that cluster can delete this CR), even while it's
    // reported offline. No fast-path exception here.
    await ctx.db.patch(row._id, {
      claimAttempts,
      leaseExpiresAt: undefined,
      status: "requested_destroy",
    });
    return;
  }

  if (row.status === "provisioning") {
    // provisioning WITH a name — the one case with no future claim call to
    // defer to, so it must resolve itself. operatorOffline is the "react
    // faster" fast-path (a confirmed-dead operator will never report back);
    // a healthy operator just running long gets its lease extended, capped
    // at MAX_CLAIM_ATTEMPTS lease cycles so this doesn't extend forever.
    if (operatorOffline || totalAttempts(claimAttempts) >= MAX_CLAIM_ATTEMPTS) {
      await ctx.db.patch(row._id, {
        claimAttempts,
        failureReason: operatorOffline
          ? "owning operator went offline mid-provisioning; workload may be partially deployed"
          : `provisioning confirmation did not complete after ${MAX_CLAIM_ATTEMPTS} lease timeouts`,
        leaseExpiresAt: undefined,
        status: "active",
      });
      return;
    }
    await ctx.db.patch(row._id, {
      claimAttempts,
      leaseExpiresAt: Date.now() + CLAIM_TIMEOUT_MS,
    });
    return;
  }

  // redeploying/stopping/resuming: the SAME fixed operator is the only one
  // that can ever reclaim these via claimOperation. If it's confirmed
  // offline, waiting for it to come back and hit its own cap would recreate
  // the exact stuck-forever bug this project fixes — resolve immediately
  // instead of requeuing to a same-operator-only state nobody will claim.
  if (operatorOffline) {
    if (row.status === "resuming") {
      await ctx.db.patch(row._id, {
        claimAttempts,
        failureReason: "resume did not complete: owning operator went offline",
        leaseExpiresAt: undefined,
        status: "stopped",
      });
      return;
    }
    await ctx.db.patch(row._id, {
      claimAttempts,
      failureReason: `${row.status} did not complete: owning operator went offline`,
      leaseExpiresAt: undefined,
      status: "active",
    });
    return;
  }

  if (row.status === "redeploying") {
    await ctx.db.patch(row._id, {
      claimAttempts,
      leaseExpiresAt: undefined,
      status: "requested_redeploy",
    });
    return;
  }
  if (row.status === "stopping") {
    await ctx.db.patch(row._id, {
      claimAttempts,
      leaseExpiresAt: undefined,
      status: "requested_stop",
    });
    return;
  }
  // resuming, by elimination — provisioning/destroying were handled above.
  await ctx.db.patch(row._id, {
    claimAttempts,
    leaseExpiresAt: undefined,
    status: "requested_resume",
  });
};

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
// ran, the operator's tags no longer match, or its reported catalog no
// longer has this exact templateVersion) — callers treat null as "skip this
// one, try the next heartbeat."
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
    // Same staleness reasoning, for the operator's catalog: it may have
    // changed (or another, differently-versioned operator's listClaimable
    // snapshot may have gone stale) between listClaimable and this call.
    if (
      !supportsTemplateVersion(
        operator.catalog,
        row.templateId,
        row.templateVersion
      )
    ) {
      return null;
    }
    // Every previous hold on this operation instance ended in a release
    // (releaseClaim) before we ever get back here — if the ledger already
    // shows MAX_CLAIM_ATTEMPTS, no further claim is allowed regardless of
    // which operator is asking now. Finalize instead of claiming.
    if (totalAttempts(row.claimAttempts) >= MAX_CLAIM_ATTEMPTS) {
      await ctx.db.patch(row._id, {
        failureReason: `exceeded ${MAX_CLAIM_ATTEMPTS} claim attempts (create)`,
        status: "failed",
      });
      return null;
    }

    await ctx.db.patch(row._id, {
      leaseExpiresAt: Date.now() + CLAIM_TIMEOUT_MS,
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

// Called by adminRequestDestroy below (admin bypass — no ownership check).
export const applyDestroy = internalMutation({
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
      await ctx.db.patch(row._id, {
        claimAttempts: undefined,
        status: "requested_destroy",
      });
      return null;
    }
    // A `failed` row with no `name` never got a live CR (the create attempt
    // itself failed) — nothing for an operator to tear down, so this is a
    // direct soft-delete rather than a claimable operation.
    if (row.status === "failed" && !row.name) {
      await ctx.db.patch(row._id, { status: "destroyed" });
      return null;
    }
    // A `failed` row that DOES have a `name` is a destroy abandoned after
    // MAX_CLAIM_ATTEMPTS (see releaseClaim/claimOperation) — the CR may
    // still be live, so give it a fresh operation instance rather than
    // treating it as permanently un-cleanupable.
    if (row.status === "failed" && row.name) {
      await ctx.db.patch(row._id, {
        claimAttempts: undefined,
        status: "requested_destroy",
      });
      return null;
    }
    throw new Error(`Cannot destroy a workload with status "${row.status}"`);
  },
  returns: v.null(),
});

// Called by adminRequestStop below (admin bypass — no ownership check).
// Scale-to-0 pause — keeps the CR/Service in place (see the plan's "Unified
// status model"); only reachable from `active`.
export const applyStop = internalMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row) {
      throw new Error("Workload not found");
    }
    if (row.status !== "active") {
      throw new Error(`Cannot stop a workload with status "${row.status}"`);
    }
    await ctx.db.patch(row._id, {
      claimAttempts: undefined,
      status: "requested_stop",
    });
    return null;
  },
  returns: v.null(),
});

// Called by adminRequestResume below (admin bypass — no ownership check).
// Only reachable from `stopped` — the mirror of applyStop.
export const applyResume = internalMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    if (!row) {
      throw new Error("Workload not found");
    }
    if (row.status !== "stopped") {
      throw new Error(`Cannot resume a workload with status "${row.status}"`);
    }
    await ctx.db.patch(row._id, {
      claimAttempts: undefined,
      status: "requested_resume",
    });
    return null;
  },
  returns: v.null(),
});

// Called from workloads/actions.ts#adminRequestRedeploy (admin bypass — no
// ownership check). Leaves name/displayName/operatorId untouched — redeploy
// never moves a workload to a different operator.
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
      claimAttempts: undefined,
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
// spec changes. redeploy is the one branch that DOES fetch the operator
// row, for the same version-staleness reasoning as claim() above — its
// templateVersion was captured moments earlier in adminRequestRedeploy
// from this exact operator, so the race window is narrow, but not zero.
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
    // Same reasoning as claim's own exhausted check above: every previous
    // hold ended in a release before we get back here, so a ledger already
    // at MAX_CLAIM_ATTEMPTS means no further attempt is allowed.
    if (totalAttempts(row.claimAttempts) >= MAX_CLAIM_ATTEMPTS) {
      const fallback = terminalFallbackForExhausted(row.status);
      await ctx.db.patch(row._id, {
        failureReason: fallback.failureReason,
        status: fallback.status,
      });
      return null;
    }

    const leaseExpiresAt = Date.now() + CLAIM_TIMEOUT_MS;

    if (row.status === "requested_destroy") {
      await ctx.db.patch(row._id, { leaseExpiresAt, status: "destroying" });
      return {
        name: row.name,
        namespace: row.namespace,
        operation: "destroy" as const,
      };
    }

    if (row.status === "requested_redeploy") {
      const operator = await ctx.db.get(args.operatorId);
      if (
        !operator ||
        !supportsTemplateVersion(
          operator.catalog,
          row.templateId,
          row.templateVersion
        )
      ) {
        return null;
      }
      await ctx.db.patch(row._id, { leaseExpiresAt, status: "redeploying" });
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
      await ctx.db.patch(row._id, { leaseExpiresAt, status: "stopping" });
      return {
        name: row.name,
        namespace: row.namespace,
        operation: "stop" as const,
      };
    }

    await ctx.db.patch(row._id, { leaseExpiresAt, status: "resuming" });
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
    // Set by the operator on a retryable provisioning failure (Create/
    // Redeploy/SetSuspended/Destroy erroring) — routes to releaseClaim
    // (always requeues) instead of the plain resolveLifecycleStatus path
    // below. The Go client MUST always send `retryable: true` alongside a
    // "destroying" row's failure report — resolveLifecycleStatus has no
    // case for "destroying" and was never meant to, since destroy
    // completion is normally reported via the separate reportDestroyed/
    // /operators/workloads/remove route, never through here. The guard
    // below defends against any other combination reaching a "destroying"
    // row by treating it as "stale" instead.
    retryable: v.optional(v.boolean()),
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
      row.status !== "resuming" &&
      row.status !== "destroying"
    ) {
      return "stale";
    }
    const isRetryableFailure = args.phase === "failed" && args.retryable;
    if (row.status === "destroying" && !isRetryableFailure) {
      return "stale";
    }

    if (isRetryableFailure) {
      await releaseClaim(ctx, row, false);
      return "updated";
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

// Cron target (see convex/crons.ts). Sweeps every in-flight status for two
// distinct kinds of stuck claim: (1) the lease expired without the owning
// operator ever reporting back, and (2) the owning operator is already known
// to be offline/ready_to_destroy (from operators/mutations.ts#
// promoteHealthStatuses), which is reacted to immediately rather than
// waiting out the remaining lease — a dead operator will never report back
// regardless of how much lease time is left. Both paths delegate to
// releaseClaim, same as reportLifecycle's retryable branch — one release
// implementation, three ways to trigger it.
export const sweepStaleClaims = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const inFlightStatuses = [
      "provisioning",
      "redeploying",
      "stopping",
      "resuming",
      "destroying",
    ] as const;
    const seen = new Set<Id<"workloads">>();
    const releases: Promise<void>[] = [];

    const expiredByStatus = await Promise.all(
      inFlightStatuses.map((status) =>
        ctx.db
          .query("workloads")
          .withIndex("by_status_and_leaseExpiresAt", (q) =>
            q.eq("status", status).lt("leaseExpiresAt", now)
          )
          .take(50)
      )
    );
    for (const rows of expiredByStatus) {
      for (const row of rows) {
        if (seen.has(row._id)) {
          continue;
        }
        seen.add(row._id);
        releases.push(releaseClaim(ctx, row, false));
      }
    }

    // Bounded scan matching promoteHealthStatuses' own shape — a fleet-sized
    // table, not one that needs its own index for this pass.
    const operators = await ctx.db.query("operators").take(500);
    const deadOperators = operators.filter(
      (op) =>
        op.healthStatus === "offline" || op.healthStatus === "ready_to_destroy"
    );
    const staleByDeadOperator = await Promise.all(
      deadOperators.flatMap((op) =>
        inFlightStatuses.map((status) =>
          ctx.db
            .query("workloads")
            .withIndex("by_operator_and_status", (q) =>
              q.eq("operatorId", op._id).eq("status", status)
            )
            .take(50)
        )
      )
    );
    for (const rows of staleByDeadOperator) {
      for (const row of rows) {
        if (seen.has(row._id)) {
          continue;
        }
        seen.add(row._id);
        releases.push(releaseClaim(ctx, row, true));
      }
    }

    await Promise.all(releases);
    return null;
  },
  returns: v.null(),
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

// --- Admin-facing entry points below ---------------------------------------

// Actual logic for stopAllWorkloadsForUser, split into its own internal
// mutation so it's directly testable (see workloads-mutations.test.ts)
// without needing a full admin-authenticated identity in convex-test — the
// public wrapper below is the only thing gated by adminMutation (see
// convex/functions.ts). Scoped via `by_user` then filtered to `active` in
// memory (a bounded read, same `.take(100)` convention used elsewhere in
// this file) — only this user's active rows are ever touched, nothing else.
export const stopAllWorkloadsForUserInternal = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);
    const active = rows.filter((row) => row.status === "active");
    await Promise.all(
      active.map((row) => ctx.db.patch(row._id, { status: "requested_stop" }))
    );
    return null;
  },
  returns: v.null(),
});

// The actual ban-flow trigger: stops every currently-`active` workload
// belonging to the given user. Admin-gated, invoked directly (Convex
// dashboard or a small script) — no dedicated "Ban user" UI in this plan.
export const stopAllWorkloadsForUser = adminMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.workloads.mutations.stopAllWorkloadsForUserInternal,
      args
    );
    return null;
  },
  returns: v.null(),
});

// The unban-flow mirror of stopAllWorkloadsForUserInternal above — same
// split for the same testability reason.
export const resumeAllWorkloadsForUserInternal = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(100);
    const stopped = rows.filter((row) => row.status === "stopped");
    await Promise.all(
      stopped.map((row) =>
        ctx.db.patch(row._id, { status: "requested_resume" })
      )
    );
    return null;
  },
  returns: v.null(),
});

// The unban-flow trigger: resumes every currently-`stopped` workload
// belonging to the given user. Same admin-gated, invoked-directly shape as
// stopAllWorkloadsForUser above.
export const resumeAllWorkloadsForUser = adminMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.workloads.mutations.resumeAllWorkloadsForUserInternal,
      args
    );
    return null;
  },
  returns: v.null(),
});

// Single-workload lifecycle actions for the admin Fleet view — unlike
// stopAllWorkloadsForUser/resumeAllWorkloadsForUser above (which bypass the
// per-row status guard for a bulk ban/unban flow), these go through the
// exact same internal mutations the owner-facing public mutations below use,
// so an admin gets the identical status-transition guards a user does — just
// without the ownership check, since admin intentionally acts across every
// user's workloads. Each internal mutation throws its own "not found"/
// "cannot X a workload with status Y" error, so there's nothing to re-check
// here.
export const adminRequestStop = adminMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.workloads.mutations.applyStop, args);
    return null;
  },
  returns: v.null(),
});

export const adminRequestResume = adminMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.workloads.mutations.applyResume, args);
    return null;
  },
  returns: v.null(),
});

export const adminRequestDestroy = adminMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.workloads.mutations.applyDestroy, args);
    return null;
  },
  returns: v.null(),
});

// Admin mirror of getWorkloadAccessToken below — mints a one-time gateway
// token identifying the calling ADMIN (better-auth's one-time-token plugin
// has no notion of "on behalf of another user"), so this can open any
// active workload regardless of who owns it. See convex/operators/http.ts's
// gateway/verify route (branches on the verified token's own role) and
// workloads/queries.ts#getActiveForAdmin for the other half of this: an
// admin opening a workload is authenticated and audited as the admin, not
// impersonating the real owner.
//
// A mutation, not an action, for the same reason as its owner-facing
// counterpart: generateOneTimeToken is a pure in-transaction DB write, no
// outbound fetch — see authedMutation's doc comment in convex/functions.ts.
export const adminGetWorkloadAccessToken = adminMutation({
  args: { workloadId: v.id("workloads") },
  handler: async (
    ctx,
    args
  ): Promise<{
    externalUrl: string;
    name: string;
    namespace: string;
    token: string;
  }> => {
    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getById,
      { workloadId: args.workloadId }
    );
    if (!row) {
      throw new Error("Workload not found");
    }
    if (!row.operatorId || !row.name || !row.namespace) {
      throw new Error("Workload is not active");
    }

    const operator = await ctx.runQuery(
      internal.operators.queries.getExternalUrl,
      { operatorId: row.operatorId }
    );
    if (!operator) {
      throw new Error("Workload not found");
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const { token } = await auth.api.generateOneTimeToken({ headers });

    return {
      externalUrl: operator.externalUrl,
      name: row.name,
      namespace: row.namespace,
      token,
    };
  },
  returns: v.object({
    externalUrl: v.string(),
    name: v.string(),
    namespace: v.string(),
    token: v.string(),
  }),
});

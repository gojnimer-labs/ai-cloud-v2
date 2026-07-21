import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { authedQuery } from "../functions";
import { supportsTemplateVersion } from "../operators/catalogMatch";
import { matchesTags } from "../operators/tagMatch";
import { resolveWorkloadPermissions } from "../presets/permissions";
import {
  groupBadgeColorValidator,
  resolveThumbnailUrl,
} from "../presets/queries";
import { workloadStatusValidator } from "../schema";

const lifecycleActionValidator = v.union(
  v.literal("stop"),
  v.literal("resume"),
  v.literal("redeploy"),
  v.literal("destroy")
);

// Effective grants for the calling user's OWN copy of this workload, already
// resolved from its source preset (see presets/permissions.ts) — "all" means
// unrestricted (not preset-sourced, or a preset created before this field
// existed), an array is an explicit allow-list.
const permissionsValidator = {
  allowedEntrypoints: v.union(v.literal("all"), v.array(v.string())),
  allowedLifecycleActions: v.union(
    v.literal("all"),
    v.array(lifecycleActionValidator)
  ),
  allowedOperations: v.union(v.literal("all"), v.array(v.string())),
};

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
  sourcePresetId: v.optional(v.id("presets")),
  sourcePresetVersionId: v.optional(v.id("presetVersions")),
  status: workloadStatusValidator,
  subdomain: v.optional(v.string()),
  templateId: v.string(),
  templateVersion: v.optional(v.string()),
  userId: v.string(),
});

// The Workspace page's "ongoing workloads" data source — every non-destroyed
// workload the calling user owns, most recent first, live-updating as
// claim/heartbeat moves status through requested -> provisioning -> active.
// Destroyed workloads are true history and are filtered out below; the
// Workspace page has no history view, so a destroyed row would otherwise
// linger with nothing useful to show. Bounded rather than paginated, same
// "personal list, not infinite scroll" convention as the rest of this app's
// owner-facing surfaces. take(200) (bumped from a plain take(50)) is
// generous headroom for the post-filter step below, not a real ceiling —
// same convention as presets/queries.ts#listPresets. Note: a user whose most
// recent 200 workloads (destroyed + live combined) happen to be dominated by
// short-lived destroyed test runs could still see an older live workload
// fall outside this window; this is an accepted tradeoff (already present,
// worse, at the old take(50)) rather than a solved problem — a denormalized
// indexed "isDestroyed" flag would remove it entirely but is out of scope
// here. Filtering happens in plain JS (an array .filter()), not
// ctx.db.query(...).filter() — the Convex guidelines ban the latter (no
// index can express "any of 13 non-destroyed statuses" as an equality/range
// predicate) but plain-JS filtering of an already-fetched array is fine, the
// same pattern listAvailablePresetsForCurrentUser already uses.
export const listMine = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("workloads")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(200);
    const ongoing = rows.filter((row) => row.status !== "destroyed");

    return await Promise.all(
      ongoing.map(async (row) => {
        const [permissions, source] = await Promise.all([
          resolveWorkloadPermissions(ctx, row),
          row.sourcePresetId ? ctx.db.get(row.sourcePresetId) : null,
        ]);

        const groupRows = source
          ? await ctx.db
              .query("presetGroups")
              .withIndex("by_preset", (q) => q.eq("presetId", source._id))
              .take(200)
          : [];
        const resolvedGroups = await Promise.all(
          groupRows.map(async (presetGroup) => {
            const group = await ctx.db.get(presetGroup.groupId);
            return group
              ? {
                  _id: group._id,
                  badgeColor: group.badgeColor,
                  name: group.name,
                }
              : null;
          })
        );
        const groups = resolvedGroups.filter(
          (group): group is NonNullable<typeof group> => Boolean(group)
        );

        // A newer presetVersions snapshot exists than the one this workload
        // was deployed from — surfaced on the Workspace card as the
        // "update available" state. Only meaningful once the source preset
        // has moved on at least once (latestVersionId set) and this
        // workload actually carries provenance (sourcePresetVersionId set);
        // a dangling/missing source preset (see sourcePresetVersionId's own
        // doc comment above) never claims an update is available.
        const hasPresetUpdate = Boolean(
          source?.latestVersionId &&
            row.sourcePresetVersionId &&
            source.latestVersionId !== row.sourcePresetVersionId
        );

        return {
          _id: row._id,
          allowedEntrypoints: permissions.allowedEntrypoints,
          allowedLifecycleActions: permissions.allowedLifecycleActions,
          allowedOperations: permissions.allowedOperations,
          createdAt: row.createdAt,
          displayName: row.displayName,
          groups,
          hasPresetUpdate,
          sourcePresetDisplayName: source?.displayName ?? null,
          sourcePresetId: row.sourcePresetId,
          status: row.status,
          templateId: row.templateId,
          templateVersion: row.templateVersion,
          thumbnailUrl: source
            ? await resolveThumbnailUrl(ctx, source.thumbnailFileId)
            : null,
        };
      })
    );
  },
  returns: v.array(
    v.object({
      _id: v.id("workloads"),
      ...permissionsValidator,
      createdAt: v.number(),
      displayName: v.string(),
      groups: v.array(
        v.object({
          _id: v.id("groups"),
          badgeColor: groupBadgeColorValidator,
          name: v.string(),
        })
      ),
      hasPresetUpdate: v.boolean(),
      sourcePresetDisplayName: v.union(v.string(), v.null()),
      sourcePresetId: v.optional(v.id("presets")),
      status: workloadStatusValidator,
      templateId: v.string(),
      templateVersion: v.optional(v.string()),
      thumbnailUrl: v.union(v.string(), v.null()),
    })
  ),
});

// Lets an ACTION resolve a workload's effective preset permissions —
// resolveWorkloadPermissions (presets/permissions.ts) reads ctx.db, which
// actions don't have (see the Convex guideline "Never use ctx.db inside of
// an action"), so requestRedeploy/runOperation in workloads/actions.ts call
// this via ctx.runQuery instead of calling the helper directly. Returns null
// if the row itself no longer exists — callers treat that the same as
// workload.not_found, same as every other lookup-by-id here.
export const resolvePermissionsForWorkload = internalQuery({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.workloadId);
    return row ? await resolveWorkloadPermissions(ctx, row) : null;
  },
  returns: v.union(v.object(permissionsValidator), v.null()),
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

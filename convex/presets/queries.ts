import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { adminQuery, authedQuery } from "../functions";
import { buildTemplateLookup } from "../operators/queries";
import { resolveFileUrl } from "../storage/r2";

export const groupBadgeColorValidator = v.union(
  v.literal("blue"),
  v.literal("cyan"),
  v.literal("green"),
  v.literal("orange"),
  v.literal("pink"),
  v.literal("purple"),
  v.literal("red"),
  v.literal("teal"),
  v.literal("yellow")
);

const lifecycleActionValidator = v.union(
  v.literal("stop"),
  v.literal("resume"),
  v.literal("redeploy"),
  v.literal("destroy")
);

// `undefined` (legacy presets predating this field) is normalized to the
// full "allow all" semantics only at the enforcement layer (see
// presets/permissions.ts) — queries return the raw stored value as-is so the
// edit form can tell "never configured" apart from "explicitly allow all".
const accessControlFieldsValidator = {
  allowedEntrypoints: v.optional(v.array(v.string())),
  allowedLifecycleActions: v.optional(v.array(lifecycleActionValidator)),
  allowedOperations: v.optional(v.array(v.string())),
};

const presetRowValidator = v.object({
  _id: v.id("presets"),
  ...accessControlFieldsValidator,
  createdAt: v.number(),
  currentVersion: v.number(),
  desiredOperatorTags: v.array(v.string()),
  displayName: v.string(),
  groupIds: v.array(v.id("groups")),
  templateId: v.string(),
  templateVersion: v.string(),
  thumbnailUrl: v.union(v.string(), v.null()),
  updatedAt: v.number(),
});

export const resolveThumbnailUrl = async (
  ctx: QueryCtx,
  thumbnailFileId: Id<"files"> | undefined
): Promise<string | null> => {
  if (!thumbnailFileId) {
    return null;
  }
  const file = await ctx.db.get(thumbnailFileId);
  return file ? await resolveFileUrl(file) : null;
};

// Admin list — bounded, same "fleet overview, not infinite scroll"
// convention as listGroups/listFiles. Resolves each row's thumbnail URL and
// group ids server-side so the admin table needs no client-side joins.
export const listPresets = adminQuery({
  args: {},
  handler: async (ctx) => {
    const presets = await ctx.db.query("presets").order("desc").take(200);
    return await Promise.all(
      presets.map(async (preset) => {
        const groupRows = await ctx.db
          .query("presetGroups")
          .withIndex("by_preset", (q) => q.eq("presetId", preset._id))
          .take(200);
        return {
          _id: preset._id,
          allowedEntrypoints: preset.allowedEntrypoints,
          allowedLifecycleActions: preset.allowedLifecycleActions,
          allowedOperations: preset.allowedOperations,
          createdAt: preset.createdAt,
          currentVersion: preset.currentVersion,
          desiredOperatorTags: preset.desiredOperatorTags,
          displayName: preset.displayName,
          groupIds: groupRows.map((row) => row.groupId),
          templateId: preset.templateId,
          templateVersion: preset.templateVersion,
          thumbnailUrl: await resolveThumbnailUrl(ctx, preset.thumbnailFileId),
          updatedAt: preset.updatedAt,
        };
      })
    );
  },
  returns: v.array(presetRowValidator),
});

// Single-row detail for the admin edit dialog — includes the latest
// snapshot's raw params, needed to prefill the parameter form.
export const getPreset = adminQuery({
  args: { presetId: v.id("presets") },
  handler: async (ctx, args) => {
    const preset = await ctx.db.get(args.presetId);
    if (!preset) {
      return null;
    }
    const [groupRows, latestVersion] = await Promise.all([
      ctx.db
        .query("presetGroups")
        .withIndex("by_preset", (q) => q.eq("presetId", preset._id))
        .take(200),
      preset.latestVersionId ? ctx.db.get(preset.latestVersionId) : null,
    ]);
    return {
      _id: preset._id,
      allowedEntrypoints: preset.allowedEntrypoints,
      allowedLifecycleActions: preset.allowedLifecycleActions,
      allowedOperations: preset.allowedOperations,
      createdAt: preset.createdAt,
      currentVersion: preset.currentVersion,
      desiredOperatorTags: preset.desiredOperatorTags,
      displayName: preset.displayName,
      groupIds: groupRows.map((row) => row.groupId),
      params: latestVersion?.params ?? {},
      templateId: preset.templateId,
      templateVersion: preset.templateVersion,
      thumbnailFileId: preset.thumbnailFileId,
      thumbnailUrl: await resolveThumbnailUrl(ctx, preset.thumbnailFileId),
      updatedAt: preset.updatedAt,
    };
  },
  returns: v.union(
    v.object({
      _id: v.id("presets"),
      ...accessControlFieldsValidator,
      createdAt: v.number(),
      currentVersion: v.number(),
      desiredOperatorTags: v.array(v.string()),
      displayName: v.string(),
      groupIds: v.array(v.id("groups")),
      params: v.any(),
      templateId: v.string(),
      templateVersion: v.string(),
      thumbnailFileId: v.optional(v.id("files")),
      thumbnailUrl: v.union(v.string(), v.null()),
      updatedAt: v.number(),
    }),
    v.null()
  ),
});

// Version history for the admin selected-panel — every presetVersions row
// for this preset, newest first, so the panel can list them and offer
// "Promote" on any non-current row. Bounded like every other admin list
// query in this file (a preset accumulates one row per deployable-shape
// edit, not per view, so 200 is generous headroom, not a real ceiling risk).
export const listPresetVersions = adminQuery({
  args: { presetId: v.id("presets") },
  handler: async (ctx, args) => {
    const versions = await ctx.db
      .query("presetVersions")
      .withIndex("by_preset", (q) => q.eq("presetId", args.presetId))
      .order("desc")
      .take(200);
    return versions.map((version) => ({
      _id: version._id,
      createdAt: version.createdAt,
      createdBy: version.createdBy,
      templateId: version.templateId,
      templateVersion: version.templateVersion,
      version: version.version,
    }));
  },
  returns: v.array(
    v.object({
      _id: v.id("presetVersions"),
      createdAt: v.number(),
      createdBy: v.string(),
      templateId: v.string(),
      templateVersion: v.string(),
      version: v.number(),
    })
  ),
});

// The Workspace page's data source — every preset visible to the CURRENT
// user, i.e. every preset that shares at least one group with the caller.
// A preset with zero presetGroups rows never appears here (nothing to
// intersect against), matching the "hidden from everyone" visibility rule
// enforced server-side by getDeployableSnapshotInternal below.
export const listAvailablePresetsForCurrentUser = authedQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .take(500);

    const presetIds = new Map<Id<"presets">, Doc<"groups">[]>();

    await Promise.all(
      memberships.map(async (membership) => {
        const group = await ctx.db.get(membership.groupId);
        if (!group) {
          return;
        }
        const presetGroupRows = await ctx.db
          .query("presetGroups")
          .withIndex("by_group", (q) => q.eq("groupId", membership.groupId))
          .take(500);
        for (const row of presetGroupRows) {
          const existing = presetIds.get(row.presetId) ?? [];
          existing.push(group);
          presetIds.set(row.presetId, existing);
        }
      })
    );

    const entries = await Promise.all(
      [...presetIds.entries()].map(async ([presetId, groups]) => {
        const preset = await ctx.db.get(presetId);
        return preset ? { groups, preset } : null;
      })
    );

    // One bounded operator scan for the whole list, not one per preset —
    // see buildTemplateLookup's own doc comment for why a per-preset
    // internalQuery lookup would be the wrong call here.
    const templateLookup = await buildTemplateLookup(ctx);

    return await Promise.all(
      entries
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .map(async ({ groups, preset }) => {
          // A stale/removed template (no operator still reports this exact
          // id+version) resolves to no metadata here — same "degrade
          // gracefully, don't throw" requirement as the rest of this list
          // view; deployPreset is the one place that's allowed to hard-fail
          // on a genuinely undeployable preset.
          const template = templateLookup.get(
            `${preset.templateId}@${preset.templateVersion}`
          );
          return {
            _id: preset._id,
            displayName: preset.displayName,
            groups: groups.map((group) => ({
              _id: group._id,
              badgeColor: group.badgeColor,
              name: group.name,
            })),
            templateDescription: template?.description ?? null,
            templateIcon: template?.icon ?? null,
            templateId: preset.templateId,
            templateName: template?.name ?? null,
            thumbnailUrl: await resolveThumbnailUrl(
              ctx,
              preset.thumbnailFileId
            ),
          };
        })
    );
  },
  returns: v.array(
    v.object({
      _id: v.id("presets"),
      displayName: v.string(),
      groups: v.array(
        v.object({
          _id: v.id("groups"),
          badgeColor: groupBadgeColorValidator,
          name: v.string(),
        })
      ),
      templateDescription: v.union(v.string(), v.null()),
      templateIcon: v.union(v.string(), v.null()),
      templateId: v.string(),
      templateName: v.union(v.string(), v.null()),
      thumbnailUrl: v.union(v.string(), v.null()),
    })
  ),
});

// The actual authorization boundary for deploy — called ONLY from
// presets/actions.ts#deployPreset, independent of (and not trusting) the
// Workspace list query above having already filtered. Collapses "preset
// doesn't exist", "preset has zero groups" (nobody can deploy it, decision:
// hidden from everyone including admins), and "caller isn't in any of its
// groups" into the same null result — same "no existence leak" pattern as
// files/queries.ts#get.
export const getDeployableSnapshotInternal = internalQuery({
  args: { presetId: v.id("presets"), userId: v.string() },
  handler: async (ctx, args) => {
    const preset = await ctx.db.get(args.presetId);
    if (!preset) {
      return null;
    }

    const presetGroupRows = await ctx.db
      .query("presetGroups")
      .withIndex("by_preset", (q) => q.eq("presetId", args.presetId))
      .take(200);
    if (presetGroupRows.length === 0) {
      return null;
    }

    const userGroupRows = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(500);
    const userGroupIds = new Set(userGroupRows.map((row) => row.groupId));
    const isPermitted = presetGroupRows.some((row) =>
      userGroupIds.has(row.groupId)
    );
    if (!isPermitted) {
      return null;
    }

    const snapshot = preset.latestVersionId
      ? await ctx.db.get(preset.latestVersionId)
      : null;
    if (!snapshot) {
      return null;
    }

    return {
      desiredOperatorTags: preset.desiredOperatorTags,
      displayName: preset.displayName,
      params: snapshot.params,
      presetVersionId: snapshot._id,
      templateId: snapshot.templateId,
      templateVersion: snapshot.templateVersion,
    };
  },
  returns: v.union(
    v.object({
      desiredOperatorTags: v.array(v.string()),
      displayName: v.string(),
      params: v.any(),
      presetVersionId: v.id("presetVersions"),
      templateId: v.string(),
      templateVersion: v.string(),
    }),
    v.null()
  ),
});

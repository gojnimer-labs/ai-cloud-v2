import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { adminQuery, authedQuery } from "../functions";
import { resolveFileUrl } from "../storage/r2";

const groupBadgeColorValidator = v.union(
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

const presetRowValidator = v.object({
  _id: v.id("presets"),
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

const resolveThumbnailUrl = async (
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

    return await Promise.all(
      entries
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .map(async ({ groups, preset }) => ({
          _id: preset._id,
          displayName: preset.displayName,
          groups: groups.map((group) => ({
            _id: group._id,
            badgeColor: group.badgeColor,
            name: group.name,
          })),
          templateId: preset.templateId,
          thumbnailUrl: await resolveThumbnailUrl(ctx, preset.thumbnailFileId),
        }))
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
      templateId: v.string(),
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

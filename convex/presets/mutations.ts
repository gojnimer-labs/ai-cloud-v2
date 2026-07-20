import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { adminMutation } from "../functions";
import { appError } from "../lib/errors";
import { isSnapshotEquivalent } from "./versioning";

const lifecycleActionValidator = v.union(
  v.literal("stop"),
  v.literal("resume"),
  v.literal("redeploy"),
  v.literal("destroy")
);

const presetFieldsValidator = {
  // Always sent as explicit (possibly empty) arrays by the form — never
  // omitted — so a template gaining a new entrypoint/operation later doesn't
  // silently grant access to it. See schema.ts's doc comment on
  // presets.allowedEntrypoints.
  allowedEntrypoints: v.array(v.string()),
  allowedLifecycleActions: v.array(lifecycleActionValidator),
  allowedOperations: v.array(v.string()),
  desiredOperatorTags: v.array(v.string()),
  displayName: v.string(),
  groupIds: v.array(v.id("groups")),
  params: v.record(v.string(), v.any()),
  templateId: v.string(),
  templateVersion: v.string(),
  thumbnailFileId: v.optional(v.id("files")),
};

// Full-replace diff of a preset's group associations — exact mirror of
// groups/mutations.ts#setUserGroupsInternal, keyed by presetId via
// presetGroups.by_preset instead of by_user. Never touches
// presets.currentVersion/latestVersionId: group membership is metadata,
// entirely outside the version-bump diff (see versioning.ts).
export const setPresetGroupsInternal = internalMutation({
  args: { groupIds: v.array(v.id("groups")), presetId: v.id("presets") },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("presetGroups")
      .withIndex("by_preset", (q) => q.eq("presetId", args.presetId))
      .take(500);
    const desiredGroupIds = new Set(args.groupIds);
    const currentGroupIds = new Set(current.map((row) => row.groupId));

    await Promise.all(
      current
        .filter((row) => !desiredGroupIds.has(row.groupId))
        .map((row) => ctx.db.delete(row._id))
    );
    await Promise.all(
      args.groupIds
        .filter((groupId) => !currentGroupIds.has(groupId))
        .map((groupId) =>
          ctx.db.insert("presetGroups", { groupId, presetId: args.presetId })
        )
    );
    return null;
  },
  returns: v.null(),
});

export const setPresetGroups = adminMutation({
  args: { groupIds: v.array(v.id("groups")), presetId: v.id("presets") },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.presets.mutations.setPresetGroupsInternal,
      args
    );
    return null;
  },
  returns: v.null(),
});

export const createPresetInternal = internalMutation({
  args: { ...presetFieldsValidator, createdBy: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const presetId = await ctx.db.insert("presets", {
      allowedEntrypoints: args.allowedEntrypoints,
      allowedLifecycleActions: args.allowedLifecycleActions,
      allowedOperations: args.allowedOperations,
      createdAt: now,
      createdBy: args.createdBy,
      currentVersion: 1,
      desiredOperatorTags: args.desiredOperatorTags,
      displayName: args.displayName,
      // Patched immediately below once the version-1 snapshot exists — see
      // the schema's own doc comment on why this field is optional.
      templateId: args.templateId,
      templateVersion: args.templateVersion,
      thumbnailFileId: args.thumbnailFileId,
      updatedAt: now,
    });
    const versionId = await ctx.db.insert("presetVersions", {
      createdAt: now,
      createdBy: args.createdBy,
      params: args.params,
      presetId,
      templateId: args.templateId,
      templateVersion: args.templateVersion,
      version: 1,
    });
    await ctx.db.patch(presetId, { latestVersionId: versionId });
    await ctx.runMutation(internal.presets.mutations.setPresetGroupsInternal, {
      groupIds: args.groupIds,
      presetId,
    });
    return presetId;
  },
  returns: v.id("presets"),
});

export const createPreset = adminMutation({
  args: presetFieldsValidator,
  handler: async (ctx, args) => {
    // Discards the created id (the admin form dialog just closes and the
    // list re-queries live) rather than returning it directly — returning
    // ctx.runMutation(internal.presets.mutations.createPresetInternal, ...)
    // as this handler's own result creates a genuine circular type: this
    // module's generated `internal` type is `typeof` this very file, so
    // resolving createPresetInternal's return type would require this
    // handler's return type to already be known. Every other mutation in
    // this file avoids the same trap the same way (see updatePreset/
    // deletePreset/setPresetGroups below).
    await ctx.runMutation(internal.presets.mutations.createPresetInternal, {
      ...args,
      createdBy: ctx.user._id,
    });
    return null;
  },
  returns: v.null(),
});

export const updatePresetInternal = internalMutation({
  args: {
    ...presetFieldsValidator,
    createdBy: v.string(),
    presetId: v.id("presets"),
  },
  handler: async (ctx, args) => {
    const preset = await ctx.db.get(args.presetId);
    if (!preset) {
      throw appError("preset.not_found");
    }
    const latest = preset.latestVersionId
      ? await ctx.db.get(preset.latestVersionId)
      : null;

    const bumps =
      !latest ||
      !isSnapshotEquivalent(latest, {
        params: args.params,
        templateId: args.templateId,
        templateVersion: args.templateVersion,
      });

    const now = Date.now();
    if (bumps) {
      const nextVersion = preset.currentVersion + 1;
      const versionId = await ctx.db.insert("presetVersions", {
        createdAt: now,
        createdBy: args.createdBy,
        params: args.params,
        presetId: args.presetId,
        templateId: args.templateId,
        templateVersion: args.templateVersion,
        version: nextVersion,
      });
      await ctx.db.patch(args.presetId, {
        allowedEntrypoints: args.allowedEntrypoints,
        allowedLifecycleActions: args.allowedLifecycleActions,
        allowedOperations: args.allowedOperations,
        currentVersion: nextVersion,
        desiredOperatorTags: args.desiredOperatorTags,
        displayName: args.displayName,
        latestVersionId: versionId,
        templateId: args.templateId,
        templateVersion: args.templateVersion,
        thumbnailFileId: args.thumbnailFileId,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(args.presetId, {
        allowedEntrypoints: args.allowedEntrypoints,
        allowedLifecycleActions: args.allowedLifecycleActions,
        allowedOperations: args.allowedOperations,
        desiredOperatorTags: args.desiredOperatorTags,
        displayName: args.displayName,
        thumbnailFileId: args.thumbnailFileId,
        updatedAt: now,
      });
    }

    await ctx.runMutation(internal.presets.mutations.setPresetGroupsInternal, {
      groupIds: args.groupIds,
      presetId: args.presetId,
    });
    return null;
  },
  returns: v.null(),
});

// Rolls a preset forward to re-deploy an older snapshot's shape, rather than
// repointing latestVersionId backward — the version history is append-only
// (see schema.ts's doc comment on presetVersions), so "promoting" version N
// inserts a brand-new version N+1 that copies N's templateId/templateVersion/
// params. This keeps `currentVersion` monotonically increasing and every
// existing workload's sourcePresetVersionId (which points at an immutable
// row) permanently valid — nothing before this insert is mutated or deleted.
// Always bumps, even if the target snapshot is identical to the current one
// (isSnapshotEquivalent isn't consulted here): promoting is an explicit admin
// action with its own audit trail (createdBy/createdAt on the new row), not
// a plain edit that should collapse into a no-op.
export const promotePresetVersion = adminMutation({
  args: { presetId: v.id("presets"), versionId: v.id("presetVersions") },
  handler: async (ctx, args) => {
    const preset = await ctx.db.get(args.presetId);
    if (!preset) {
      throw appError("preset.not_found");
    }
    const target = await ctx.db.get(args.versionId);
    if (!target || target.presetId !== args.presetId) {
      throw appError("preset.version_not_found");
    }

    const now = Date.now();
    const nextVersion = preset.currentVersion + 1;
    const versionId = await ctx.db.insert("presetVersions", {
      createdAt: now,
      createdBy: ctx.user._id,
      params: target.params,
      presetId: args.presetId,
      templateId: target.templateId,
      templateVersion: target.templateVersion,
      version: nextVersion,
    });
    await ctx.db.patch(args.presetId, {
      currentVersion: nextVersion,
      latestVersionId: versionId,
      templateId: target.templateId,
      templateVersion: target.templateVersion,
      updatedAt: now,
    });
    return null;
  },
  returns: v.null(),
});

export const updatePreset = adminMutation({
  args: { ...presetFieldsValidator, presetId: v.id("presets") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.presets.mutations.updatePresetInternal, {
      ...args,
      createdBy: ctx.user._id,
    });
    return null;
  },
  returns: v.null(),
});

const DELETE_BATCH_SIZE = 200;

// Cascade-deletes presetVersions/presetGroups rows in batches before the
// preset row itself — same reschedule-if-full-batch pattern as
// groups/mutations.ts#deleteGroupInternal. A workload's sourcePresetId/
// sourcePresetVersionId pointing at a preset deleted this way becomes a
// dangling ref — acceptable for provenance/audit display, not guarded
// against here.
export const deletePresetInternal = internalMutation({
  args: { presetId: v.id("presets") },
  handler: async (ctx, args) => {
    const versions = await ctx.db
      .query("presetVersions")
      .withIndex("by_preset", (q) => q.eq("presetId", args.presetId))
      .take(DELETE_BATCH_SIZE);
    const groupRows = await ctx.db
      .query("presetGroups")
      .withIndex("by_preset", (q) => q.eq("presetId", args.presetId))
      .take(DELETE_BATCH_SIZE);

    await Promise.all([
      ...versions.map((row) => ctx.db.delete(row._id)),
      ...groupRows.map((row) => ctx.db.delete(row._id)),
    ]);

    if (
      versions.length === DELETE_BATCH_SIZE ||
      groupRows.length === DELETE_BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.presets.mutations.deletePresetInternal,
        args
      );
      return null;
    }

    await ctx.db.delete(args.presetId);
    return null;
  },
  returns: v.null(),
});

export const deletePreset = adminMutation({
  args: { presetId: v.id("presets") },
  handler: async (ctx, args) => {
    await ctx.runMutation(
      internal.presets.mutations.deletePresetInternal,
      args
    );
    return null;
  },
  returns: v.null(),
});

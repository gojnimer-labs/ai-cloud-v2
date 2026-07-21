import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { authedAction } from "../functions";
import { appError } from "../lib/errors";
import { resolveFileParams } from "../operators/fileParams";
import { createWorkloadFromSpec } from "../workloads/actions";
import { isLifecycleActionPermitted } from "./permissions";

// Fully-automatic one-click deploy: no form, no confirmation step. Reuses
// the exact operator-resolution/file-param-resolution pipeline
// requestWorkload uses (via createWorkloadFromSpec), fed from the preset's
// own stored snapshot instead of a user-filled form. If the preset's pinned
// templateVersion is no longer live on any operator, this throws the same
// catalog.template_not_found/workload.no_matching_operator errors
// requestWorkload already throws — correct behavior for a stale preset,
// surfaced as a Workspace toast.
export const deployPreset = authedAction({
  args: { presetId: v.id("presets") },
  handler: async (ctx, args): Promise<Id<"workloads">> => {
    const snapshot = await ctx.runQuery(
      internal.presets.queries.getDeployableSnapshotInternal,
      { presetId: args.presetId, userId: ctx.user._id }
    );
    if (!snapshot) {
      throw appError("preset.not_permitted");
    }
    return await createWorkloadFromSpec(ctx, {
      desiredOperatorTags: snapshot.desiredOperatorTags,
      displayNamePrefix: snapshot.displayName,
      params: snapshot.params,
      sourcePresetId: args.presetId,
      sourcePresetVersionId: snapshot.presetVersionId,
      templateId: snapshot.templateId,
      templateVersion: snapshot.templateVersion,
      userId: ctx.user._id,
    });
  },
  returns: v.id("workloads"),
});

// One-click "catch up" for an EXISTING preset-deployed workload, mirroring
// deployPreset's own snapshot-resolution but applied to a workload that
// already exists instead of creating a fresh one. Same template as today —
// cheap in-place patch via workloads/mutations.ts#requestRedeploy (which
// also bumps the recorded sourcePresetVersionId). Different template — the
// in-place patch path has no way to change a workload's fixed templateId
// (see requestRedeploy's own doc comment), so this creates the replacement
// FIRST (reusing createWorkloadFromSpec verbatim, including its existing
// catalog.template_not_found/workload.no_matching_operator failure
// behavior) and only destroys the old workload once that succeeds — a
// failed create this way never leaves the caller with nothing. The
// replacement gets a fresh auto-generated displayName, same as any other
// preset deploy; nobody reads the underlying workload id/name directly.
export const updateToLatestPresetVersion = authedAction({
  args: { workloadId: v.id("workloads") },
  handler: async (ctx, args): Promise<Id<"workloads">> => {
    const row: Doc<"workloads"> | null = await ctx.runQuery(
      internal.workloads.queries.getOwned,
      { userId: ctx.user._id, workloadId: args.workloadId }
    );
    if (!row) {
      throw appError("workload.not_found");
    }
    if (!row.sourcePresetId) {
      throw appError("workload.no_source_preset");
    }
    if (row.status !== "active") {
      throw appError("workload.invalid_status_for_redeploy", {
        status: row.status,
      });
    }

    const permissions = await ctx.runQuery(
      internal.workloads.queries.resolvePermissionsForWorkload,
      { workloadId: row._id }
    );
    if (!permissions || !isLifecycleActionPermitted(permissions, "redeploy")) {
      throw appError("workload.action_not_permitted");
    }

    const snapshot = await ctx.runQuery(
      internal.presets.queries.getDeployableSnapshotInternal,
      { presetId: row.sourcePresetId, userId: ctx.user._id }
    );
    if (!snapshot) {
      throw appError("preset.not_permitted");
    }
    if (snapshot.presetVersionId === row.sourcePresetVersionId) {
      throw appError("preset.already_up_to_date");
    }

    if (snapshot.templateId !== row.templateId) {
      // Switching templates destroys the existing CR under the hood —
      // require destroy permission too, not just redeploy's.
      if (!isLifecycleActionPermitted(permissions, "destroy")) {
        throw appError("workload.action_not_permitted");
      }
      const newWorkloadId = await createWorkloadFromSpec(ctx, {
        desiredOperatorTags: snapshot.desiredOperatorTags,
        displayNamePrefix: snapshot.displayName,
        params: snapshot.params,
        sourcePresetId: row.sourcePresetId,
        sourcePresetVersionId: snapshot.presetVersionId,
        templateId: snapshot.templateId,
        templateVersion: snapshot.templateVersion,
        userId: ctx.user._id,
      });
      await ctx.runMutation(internal.workloads.mutations.applyDestroy, {
        workloadId: row._id,
      });
      return newWorkloadId;
    }

    if (!row.operatorId) {
      throw appError("workload.no_operator_assigned");
    }
    const template = await ctx.runQuery(
      internal.operators.queries.getOperatorCatalogTemplate,
      { operatorId: row.operatorId, templateId: snapshot.templateId }
    );
    if (!template) {
      throw appError("catalog.template_not_found");
    }
    const resolvedFileParams = await resolveFileParams(
      ctx,
      template.parameters,
      {
        rawParams: snapshot.params,
        userId: row.userId,
      }
    );
    const config: Record<string, unknown> = { ...snapshot.params };
    for (const entry of resolvedFileParams) {
      config[entry.key] = entry.paramValue;
    }

    await ctx.runMutation(internal.workloads.mutations.requestRedeploy, {
      config,
      sourcePresetVersionId: snapshot.presetVersionId,
      templateVersion: snapshot.templateVersion,
      workloadId: row._id,
    });
    return row._id;
  },
  returns: v.id("workloads"),
});

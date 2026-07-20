import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { authedAction } from "../functions";
import { appError } from "../lib/errors";
import { createWorkloadFromSpec } from "../workloads/actions";

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

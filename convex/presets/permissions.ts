import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type LifecycleAction = "destroy" | "redeploy" | "resume" | "stop";

// "all" represents an unrestricted grant — either the workload wasn't
// deployed from a preset at all, or it was deployed from a preset created
// before this field existed (see schema.ts's doc comment on
// presets.allowedEntrypoints for why `undefined` means "allow all" there).
// Deliberately resolved from the workload's sourcePresetId, NOT
// sourcePresetVersionId — same "live, not snapshotted" access model as
// presetGroups, so an admin editing a preset's grants applies immediately to
// every workload already deployed from it, not just future deploys.
export interface WorkloadPermissions {
  allowedEntrypoints: "all" | string[];
  allowedLifecycleActions: "all" | LifecycleAction[];
  allowedOperations: "all" | string[];
}

export const resolveWorkloadPermissions = async (
  ctx: MutationCtx | QueryCtx,
  workload: Doc<"workloads">
): Promise<WorkloadPermissions> => {
  const preset = workload.sourcePresetId
    ? await ctx.db.get(workload.sourcePresetId)
    : null;
  return {
    allowedEntrypoints: preset?.allowedEntrypoints ?? "all",
    allowedLifecycleActions: preset?.allowedLifecycleActions ?? "all",
    allowedOperations: preset?.allowedOperations ?? "all",
  };
};

export const isEntrypointPermitted = (
  permissions: WorkloadPermissions,
  entrypointName: string
): boolean =>
  permissions.allowedEntrypoints === "all" ||
  permissions.allowedEntrypoints.includes(entrypointName);

export const isOperationPermitted = (
  permissions: WorkloadPermissions,
  operationKey: string
): boolean =>
  permissions.allowedOperations === "all" ||
  permissions.allowedOperations.includes(operationKey);

export const isLifecycleActionPermitted = (
  permissions: WorkloadPermissions,
  action: LifecycleAction
): boolean =>
  permissions.allowedLifecycleActions === "all" ||
  permissions.allowedLifecycleActions.includes(action);

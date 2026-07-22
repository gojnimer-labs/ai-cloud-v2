import type { Doc } from "@convex/_generated/dataModel";

import { m } from "@/paraglide/messages";

import type { LifecycleAction } from "./types";

export type WorkloadStatus = Doc<"workloads">["status"];

// Same rule as admin-clusters/model/format.ts#canDestroyWorkload,
// hand-mirrored here rather than imported (this codebase never cross-imports
// between page slices — see convex/lib/errors.ts's own frontend mirror,
// src/shared/lib/get-error-message.ts, for the same convention).
export const canDestroyWorkload = (status: WorkloadStatus): boolean =>
  status === "active" || status === "stopped" || status === "failed";

// "all" mirrors convex/presets/permissions.ts#WorkloadPermissions — an
// unrestricted grant, either because the workload wasn't deployed from a
// preset or because its source preset predates this field (see
// schema.ts's doc comment on presets.allowedEntrypoints).
export const isEntrypointPermitted = (
  allowed: "all" | string[],
  entrypointName: string
): boolean => allowed === "all" || allowed.includes(entrypointName);

export const isOperationPermitted = (
  allowed: "all" | string[],
  operationKey: string
): boolean => allowed === "all" || allowed.includes(operationKey);

export const isLifecycleActionPermitted = (
  allowed: "all" | LifecycleAction[],
  action: LifecycleAction
): boolean => allowed === "all" || allowed.includes(action);

// One entry per convex/schema.ts#workloadStatusValidator literal — a Record
// over the full union (not an if/else chain) makes a new status literal a
// compile error here, not a silent fallback — same convention as
// admin-clusters/model/format.ts, whose admin_workload_status_* message
// keys this reuses directly (shared wording for a shared concept; the
// mapping itself is independent, not imported, since Workspace's status
// display is deliberately simpler than the admin fleet view).
const WORKLOAD_STATUS_LABEL: Record<WorkloadStatus, () => string> = {
  active: m.admin_workload_status_active,
  destroyed: m.admin_workload_status_destroyed,
  destroying: m.admin_workload_status_destroying,
  failed: m.admin_workload_status_failed,
  orphaned: m.admin_workload_status_orphaned,
  provisioning: m.admin_workload_status_provisioning,
  redeploying: m.admin_workload_status_redeploying,
  requested: m.admin_workload_status_requested,
  requested_destroy: m.admin_workload_status_requested_destroy,
  requested_redeploy: m.admin_workload_status_requested_redeploy,
  requested_resume: m.admin_workload_status_requested_resume,
  requested_stop: m.admin_workload_status_requested_stop,
  resuming: m.admin_workload_status_resuming,
  stopped: m.admin_workload_status_stopped,
  stopping: m.admin_workload_status_stopping,
};

export const workloadStatusLabel = (status: WorkloadStatus): string =>
  WORKLOAD_STATUS_LABEL[status]();

// The thumbnail-level visual/interaction treatment WorkloadCard renders,
// replacing the earlier inline StatusDot+label pill: "ready" shows a single
// click-to-open icon, "paused" dims the thumbnail with a click-to-resume
// icon, "in-flight" shows a centered spinner, "attention" (something's
// wrong, nothing to click) shows a static warning icon, and
// "update-available" (a "ready" workload whose source preset has moved on
// to a newer version) shows a static info icon — full status text still
// lives in the info HoverCard, not inline. Record-over-the-full-union (not
// an if/else chain) so a new status literal is a compile error here, same
// convention as WORKLOAD_STATUS_LABEL above.
export type WorkloadInteractionState =
  | "attention"
  | "in-flight"
  | "paused"
  | "ready"
  | "update-available";

const WORKLOAD_INTERACTION_STATE: Record<
  WorkloadStatus,
  WorkloadInteractionState
> = {
  active: "ready",
  destroyed: "attention",
  destroying: "in-flight",
  failed: "attention",
  orphaned: "attention",
  provisioning: "in-flight",
  redeploying: "in-flight",
  requested: "in-flight",
  requested_destroy: "in-flight",
  requested_redeploy: "in-flight",
  requested_resume: "in-flight",
  requested_stop: "in-flight",
  resuming: "in-flight",
  stopped: "paused",
  stopping: "in-flight",
};

// hasPresetUpdate only ever promotes a "ready" workload to
// "update-available" — every other state (in-flight/paused/attention)
// already has a more pressing thing to show than a version bump.
export const workloadInteractionState = (
  status: WorkloadStatus,
  hasPresetUpdate: boolean
): WorkloadInteractionState => {
  const base = WORKLOAD_INTERACTION_STATE[status];
  return base === "ready" && hasPresetUpdate ? "update-available" : base;
};

export const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

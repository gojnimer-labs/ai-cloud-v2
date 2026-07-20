import type { Doc } from "@convex/_generated/dataModel";

import { m } from "@/paraglide/messages";

export type WorkloadStatus = Doc<"workloads">["status"];

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

const WORKLOAD_STATUS_VARIANT: Record<
  WorkloadStatus,
  "accent" | "error" | "neutral" | "success" | "warning"
> = {
  active: "success",
  destroyed: "neutral",
  destroying: "warning",
  failed: "error",
  orphaned: "neutral",
  provisioning: "accent",
  redeploying: "accent",
  requested: "neutral",
  requested_destroy: "warning",
  requested_redeploy: "warning",
  requested_resume: "warning",
  requested_stop: "warning",
  resuming: "accent",
  stopped: "neutral",
  stopping: "warning",
};

const WORKLOAD_STATUS_PULSING: ReadonlySet<WorkloadStatus> = new Set([
  "requested",
  "provisioning",
  "redeploying",
  "destroying",
  "stopping",
  "resuming",
]);

export const workloadStatusLabel = (status: WorkloadStatus): string =>
  WORKLOAD_STATUS_LABEL[status]();

export const workloadStatusVariant = (
  status: WorkloadStatus
): "accent" | "error" | "neutral" | "success" | "warning" =>
  WORKLOAD_STATUS_VARIANT[status];

export const workloadStatusIsPulsing = (status: WorkloadStatus): boolean =>
  WORKLOAD_STATUS_PULSING.has(status);

export const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

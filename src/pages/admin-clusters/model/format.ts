import type { Doc } from "@convex/_generated/dataModel";

import { m } from "@/paraglide/messages";

import type { HealthStatus } from "./types";

type WorkloadStatus = Doc<"workloads">["status"];

export const healthStatusLabel = (status: HealthStatus): string => {
  if (status === "pending") {
    return m.admin_health_pending();
  }
  if (status === "healthy") {
    return m.admin_health_healthy();
  }
  if (status === "offline") {
    return m.admin_health_offline();
  }
  return m.admin_health_ready_to_destroy();
};

export const healthStatusVariant = (
  status: HealthStatus
): "neutral" | "success" | "warning" | "error" => {
  if (status === "pending") {
    return "neutral";
  }
  if (status === "healthy") {
    return "success";
  }
  if (status === "offline") {
    return "warning";
  }
  return "error";
};

// One entry per convex/schema.ts#workloadStatusValidator literal — a Record
// over the full union (rather than an if/else chain) makes adding a new
// status literal to the backend a compile error here, not a silent fallback.
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
  "neutral" | "success" | "warning" | "error" | "accent"
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
): "neutral" | "success" | "warning" | "error" | "accent" =>
  WORKLOAD_STATUS_VARIANT[status];

export const workloadStatusIsPulsing = (status: WorkloadStatus): boolean =>
  WORKLOAD_STATUS_PULSING.has(status);

export const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

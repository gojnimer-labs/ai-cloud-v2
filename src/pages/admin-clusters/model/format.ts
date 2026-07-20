import type { Doc } from "@convex/_generated/dataModel";

import { m } from "@/paraglide/messages";

import type { HealthStatus, RetentionPolicy } from "./types";

export type WorkloadStatus = Doc<"workloads">["status"];

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

export const retentionPolicyLabel = (policy: RetentionPolicy): string =>
  policy === "retain"
    ? m.admin_retention_retain()
    : m.admin_retention_standard();

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

// An `active` or `stopped` row (-> requested_destroy, claimed and torn
// down by the owning operator), or a `failed` row with no live CR to
// destroy (a direct soft-delete instead — see
// convex/workloads/mutations.ts#requestDestroy). Every other status
// either has an operation already in flight against it or has no live CR
// in the first place.
export const canDestroyWorkload = (status: WorkloadStatus): boolean =>
  status === "active" || status === "stopped" || status === "failed";

// Localized options for the PowerSearch "status" enum filter — reuses
// workloadStatusLabel() rather than hardcoding option text, and Object.keys()
// over the same Record the labels come from keeps this in sync with the full
// convex/schema.ts#workloadStatusValidator union without repeating it here.
export const WORKLOAD_STATUS_OPTIONS: {
  label: string;
  value: WorkloadStatus;
}[] = (Object.keys(WORKLOAD_STATUS_LABEL) as WorkloadStatus[]).map(
  (status) => ({
    label: workloadStatusLabel(status),
    value: status,
  })
);

export const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// ProgressBar's formatValueLabel signature is (value, max) => string, so
// these are written to match it directly for the cluster resource-usage
// bars (see cluster-detail-panel.tsx).
export const formatMilliCpuUsage = (
  usedMilliCpu: number,
  allocatableMilliCpu: number
): string => {
  const used = Number((usedMilliCpu / 1000).toFixed(2));
  const allocatable = Number((allocatableMilliCpu / 1000).toFixed(2));
  return `${used} / ${allocatable} cores`;
};

const BYTES_PER_MIB = 1024 ** 2;
const BYTES_PER_GIB = 1024 ** 3;

export const formatByteUsage = (
  usedBytes: number,
  allocatableBytes: number
): string => {
  const unit =
    allocatableBytes >= BYTES_PER_GIB ? BYTES_PER_GIB : BYTES_PER_MIB;
  const unitLabel = unit === BYTES_PER_GIB ? "GB" : "MB";
  const decimals = unit === BYTES_PER_GIB ? 1 : 0;
  const used = (usedBytes / unit).toFixed(decimals);
  const allocatable = (allocatableBytes / unit).toFixed(decimals);
  return `${used} / ${allocatable} ${unitLabel}`;
};

export const resourceUsageVariant = (
  used: number,
  allocatable: number
): "accent" | "warning" | "error" => {
  if (allocatable <= 0) {
    return "accent";
  }
  const percentage = (used / allocatable) * 100;
  if (percentage >= 90) {
    return "error";
  }
  if (percentage >= 75) {
    return "warning";
  }
  return "accent";
};

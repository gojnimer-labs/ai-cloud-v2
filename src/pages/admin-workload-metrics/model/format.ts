import { m } from "@/paraglide/messages";

import type { WorkloadMetricRow } from "./types";

const SI_SUFFIXES = ["", "k", "M", "G", "T", "P"];

const pickDecimals = (magnitude: number, tier: number): number => {
  if (tier === 0) {
    return 0;
  }
  if (magnitude >= 100) {
    return 0;
  }
  if (magnitude >= 10) {
    return 1;
  }
  return 2;
};

// Metric-agnostic magnitude formatting (see convex/schema.ts's
// "deliberately metric-agnostic" comment on workloadMetrics) — this
// dashboard never assumes a unit like bytes or requests, so values only
// ever get a plain SI suffix rather than e.g. always rendering as bytes.
export const formatSiNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "–";
  }
  const sign = value < 0 ? "-" : "";
  let magnitude = Math.abs(value);
  let tier = 0;
  while (magnitude >= 1000 && tier < SI_SUFFIXES.length - 1) {
    magnitude /= 1000;
    tier += 1;
  }
  const decimals = pickDecimals(magnitude, tier);
  return `${sign}${magnitude.toFixed(decimals)}${SI_SUFFIXES[tier]}`;
};

// "network.rxBytes" -> "Network · Rx Bytes" — a light, non-lossy
// humanization of the free-form dotted metric key (see
// convex/schema.ts#workloadMetrics), not a lookup table: a brand-new metric
// name an operator starts reporting still renders sensibly with no code
// change here.
export const formatMetricLabel = (metric: string): string =>
  metric
    .split(".")
    .map((segment) =>
      segment
        .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
        .replace(/^[a-z]/u, (char) => char.toUpperCase())
    )
    .join(" · ");

export const formatDateTime = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });

const DAY_MS = 24 * 60 * 60 * 1000;

// Timeline x-axis / tooltip label — a bucket width of a day or wider only
// needs a date, anything finer needs the time of day.
export const formatBucketLabel = (ms: number, bucketMs: number): string => {
  if (bucketMs >= DAY_MS) {
    return new Date(ms).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  }
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};

// Reuses the same translated labels admin-clusters' fleet view already
// shows for a workload's lifecycle status (see
// src/pages/admin-clusters/model/format.ts) rather than minting duplicate
// copy for the same 15 states — this page just isn't allowed to import that
// page's internals directly (page-to-page imports would cross the app's
// module boundary), so the small Record itself is re-declared here.
const WORKLOAD_STATUS_LABEL: Record<WorkloadMetricRow["status"], () => string> =
  {
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

export const workloadStatusLabel = (
  status: WorkloadMetricRow["status"]
): string => WORKLOAD_STATUS_LABEL[status]();

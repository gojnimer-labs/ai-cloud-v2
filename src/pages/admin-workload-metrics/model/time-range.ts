import { m } from "@/paraglide/messages";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type TimeRangeValue = "24h" | "30d" | "7d";

export interface TimeRangeOption {
  // Timeline bucket width for this range — chosen to keep the chart's
  // point count reasonable regardless of range: 24 points for 24h, 42 for
  // 7d, 30 for 30d.
  bucketMs: number;
  label: string;
  rangeMs: number;
  value: TimeRangeValue;
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  {
    bucketMs: HOUR_MS,
    label: m.admin_workload_metrics_range_24h(),
    rangeMs: DAY_MS,
    value: "24h",
  },
  {
    bucketMs: 4 * HOUR_MS,
    label: m.admin_workload_metrics_range_7d(),
    rangeMs: 7 * DAY_MS,
    value: "7d",
  },
  {
    // Matches workloadMetrics' 30-day retention (see
    // convex/metrics/mutations.ts#RETENTION_MS) — the widest range that can
    // possibly return data.
    bucketMs: DAY_MS,
    label: m.admin_workload_metrics_range_30d(),
    rangeMs: 30 * DAY_MS,
    value: "30d",
  },
];

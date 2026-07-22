import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type WorkloadMetricRow = FunctionReturnType<
  typeof api.metrics.queries.getWorkloadMetricsSummary
>[number];

export type TimelinePoint = FunctionReturnType<
  typeof api.metrics.queries.getWorkloadMetricsTimeline
>[number];

// Client-side aggregate of WorkloadMetricRow by owner — see
// model/aggregate.ts#groupByUser. No dedicated Convex query backs this: the
// by-user view derives it from the same rows the by-workload view renders
// directly.
export interface UserMetricRow extends Record<string, unknown> {
  increase: number;
  latestSampledAt: number;
  userEmail: string;
  userId: string;
  workloadCount: number;
}

export type DashboardView = "by-user" | "by-workload" | "overview";

import type { UserMetricRow, WorkloadMetricRow } from "./types";

// Client-side groupBy: the by-user view has no dedicated Convex query — it
// derives from the same getWorkloadMetricsSummary rows the by-workload view
// renders directly (see convex/metrics/queries.ts's doc comment on that
// query), summing each user's workloads' increase and tracking the most
// recent activity across them.
export const groupByUser = (rows: WorkloadMetricRow[]): UserMetricRow[] => {
  const byUser = new Map<string, UserMetricRow>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (existing) {
      existing.increase += row.increase;
      existing.workloadCount += 1;
      existing.latestSampledAt = Math.max(
        existing.latestSampledAt,
        row.latestSampledAt
      );
    } else {
      byUser.set(row.userId, {
        increase: row.increase,
        latestSampledAt: row.latestSampledAt,
        userEmail: row.userEmail,
        userId: row.userId,
        workloadCount: 1,
      });
    }
  }
  return [...byUser.values()];
};

export const topByIncrease = <T extends { increase: number }>(
  rows: T[],
  limit: number
): T[] => [...rows].toSorted((a, b) => b.increase - a.increase).slice(0, limit);

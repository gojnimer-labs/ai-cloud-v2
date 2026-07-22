import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Stack";

import { m } from "@/paraglide/messages";

import { formatMetricLabel, formatSiNumber } from "../model/format";
import type { TimelinePoint, WorkloadMetricRow } from "../model/types";
import { MetricStatCard } from "./metric-stat-card";
import { MetricTimelineChart } from "./metric-timeline-chart";

export const OverviewView = ({
  bucketMs,
  metric,
  rows,
  timeline,
}: {
  bucketMs: number;
  metric: string;
  rows: WorkloadMetricRow[];
  timeline: TimelinePoint[];
}) => {
  const totalIncrease = rows.reduce((sum, row) => sum + row.increase, 0);
  // "Active" here means currently active status, not merely "reported in
  // this window" — a workload destroyed partway through the window still
  // has historical samples (and still counts toward Total/Peak below, since
  // that usage genuinely happened), but it shouldn't inflate a KPI labeled
  // "active".
  const activeRows = rows.filter((row) => row.status === "active");
  const activeWorkloadCount = activeRows.length;
  const distinctUserCount = new Set(activeRows.map((row) => row.userId)).size;
  const [peak] = [...rows].toSorted((a, b) => b.increase - a.increase);

  return (
    <VStack gap={6}>
      <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={4}>
        <MetricStatCard
          label={m.admin_workload_metrics_kpi_total()}
          value={formatSiNumber(totalIncrease)}
        />
        <MetricStatCard
          label={m.admin_workload_metrics_kpi_active_workloads()}
          value={activeWorkloadCount.toLocaleString()}
        />
        <MetricStatCard
          label={m.admin_workload_metrics_kpi_active_users()}
          value={distinctUserCount.toLocaleString()}
        />
        <MetricStatCard
          caption={peak?.displayName}
          label={m.admin_workload_metrics_kpi_peak_workload()}
          value={peak ? formatSiNumber(peak.increase) : "–"}
        />
      </Grid>
      <MetricTimelineChart
        bucketMs={bucketMs}
        points={timeline}
        title={m.admin_workload_metrics_timeline_title({
          metric: formatMetricLabel(metric),
        })}
      />
    </VStack>
  );
};

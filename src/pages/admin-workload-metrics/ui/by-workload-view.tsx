import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/Stack";
import { proportional, Table } from "@astryxdesign/core/Table";
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import { topByIncrease } from "../model/aggregate";
import {
  formatDateTime,
  formatSiNumber,
  workloadStatusLabel,
} from "../model/format";
import type { WorkloadMetricRow } from "../model/types";
import { MetricBarChart } from "./metric-bar-chart";
import { MetricTimelineChart } from "./metric-timeline-chart";

const TOP_N = 8;

export const ByWorkloadView = ({
  bucketMs,
  endTime,
  metric,
  rows,
  startTime,
}: {
  bucketMs: number;
  endTime: number;
  metric: string;
  rows: WorkloadMetricRow[];
  startTime: number;
}) => {
  const [selectedWorkloadId, setSelectedWorkloadId] =
    useState<Id<"workloads"> | null>(null);

  const selectedWorkload = rows.find(
    (row) => row.workloadId === selectedWorkloadId
  );

  const workloadTimeline = useQuery(
    api.metrics.queries.getWorkloadMetricsTimeline,
    selectedWorkloadId
      ? { bucketMs, endTime, metric, startTime, workloadId: selectedWorkloadId }
      : "skip"
  );

  const sortedRows = useMemo(
    () => [...rows].toSorted((a, b) => b.increase - a.increase),
    [rows]
  );

  const chartData = useMemo(
    () =>
      topByIncrease(sortedRows, TOP_N).map((row) => ({
        label: row.displayName,
        value: row.increase,
      })),
    [sortedRows]
  );

  // Data-driven Table mode has no per-row onClick prop — a whole-row click
  // target needs a transformBodyRow plugin instead (same pattern as
  // admin-clusters' clusters-page.tsx), otherwise a per-cell handler would
  // leave each cell's own padding as a dead zone.
  const rowClickPlugin: TablePlugin<WorkloadMetricRow> = useMemo(
    () => ({
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: () => setSelectedWorkloadId(item.workloadId),
          style: { ...props.htmlProps.style, cursor: "pointer" },
        },
      }),
    }),
    []
  );

  const columns = useMemo<TableColumn<WorkloadMetricRow>[]>(
    () => [
      {
        header: m.admin_workload_metrics_column_workload(),
        key: "displayName",
        width: proportional(2),
      },
      {
        header: m.admin_workload_metrics_column_owner(),
        key: "userEmail",
        width: proportional(2),
      },
      {
        header: m.admin_workload_metrics_column_total(),
        key: "increase",
        renderCell: (row) => formatSiNumber(row.increase),
        width: proportional(1),
      },
      {
        header: m.admin_field_status(),
        key: "status",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {workloadStatusLabel(row.status)}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_workload_metrics_column_latest_activity(),
        key: "latestSampledAt",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {formatDateTime(row.latestSampledAt)}
          </Text>
        ),
        width: proportional(1),
      },
    ],
    []
  );

  if (sortedRows.length === 0) {
    return (
      <Center axis="both" minHeight={240}>
        <EmptyState
          description={m.admin_workload_metrics_empty_description()}
          title={m.admin_workload_metrics_empty_title()}
        />
      </Center>
    );
  }

  return (
    <VStack gap={6}>
      {selectedWorkload ? (
        <VStack gap={3}>
          <Button
            icon={<Icon icon={ArrowLeftIcon} size="sm" />}
            label={m.admin_workload_metrics_workload_timeline_back()}
            onClick={() => setSelectedWorkloadId(null)}
            variant="secondary"
          />
          <MetricTimelineChart
            bucketMs={bucketMs}
            isLoading={workloadTimeline === undefined}
            points={workloadTimeline ?? []}
            title={m.admin_workload_metrics_workload_timeline_title({
              name: selectedWorkload.displayName,
            })}
          />
        </VStack>
      ) : (
        <MetricBarChart
          data={chartData}
          title={m.admin_workload_metrics_top_workloads_title()}
        />
      )}
      <Card>
        <VStack gap={2}>
          <Text color="secondary" type="supporting">
            {m.admin_workload_metrics_row_hint()}
          </Text>
          <Table<WorkloadMetricRow>
            columns={columns}
            data={sortedRows}
            density="compact"
            dividers="rows"
            hasHover
            idKey="workloadId"
            plugins={{ rowClick: rowClickPlugin }}
          />
        </VStack>
      </Card>
    </VStack>
  );
};

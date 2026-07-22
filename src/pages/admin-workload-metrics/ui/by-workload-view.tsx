import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/Stack";
import { proportional, Table } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useMemo } from "react";

import { m } from "@/paraglide/messages";

import { topByIncrease } from "../model/aggregate";
import {
  formatDateTime,
  formatSiNumber,
  workloadStatusLabel,
} from "../model/format";
import type { WorkloadMetricRow } from "../model/types";
import { MetricBarChart } from "./metric-bar-chart";

const TOP_N = 8;

export const ByWorkloadView = ({ rows }: { rows: WorkloadMetricRow[] }) => {
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
      <MetricBarChart
        data={chartData}
        title={m.admin_workload_metrics_top_workloads_title()}
      />
      <Card>
        <Table<WorkloadMetricRow>
          columns={columns}
          data={sortedRows}
          density="compact"
          dividers="rows"
          hasHover
          idKey="workloadId"
        />
      </Card>
    </VStack>
  );
};

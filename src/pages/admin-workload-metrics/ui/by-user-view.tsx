import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/Stack";
import { proportional, Table } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useMemo } from "react";

import { m } from "@/paraglide/messages";

import { groupByUser, topByIncrease } from "../model/aggregate";
import { formatDateTime, formatSiNumber } from "../model/format";
import type { UserMetricRow, WorkloadMetricRow } from "../model/types";
import { MetricBarChart } from "./metric-bar-chart";

const TOP_N = 8;

export const ByUserView = ({ rows }: { rows: WorkloadMetricRow[] }) => {
  const userRows = useMemo(
    () => groupByUser(rows).toSorted((a, b) => b.increase - a.increase),
    [rows]
  );

  const chartData = useMemo(
    () =>
      topByIncrease(userRows, TOP_N).map((row) => ({
        label: row.userEmail,
        value: row.increase,
      })),
    [userRows]
  );

  const columns = useMemo<TableColumn<UserMetricRow>[]>(
    () => [
      {
        header: m.admin_workload_metrics_column_user(),
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
        header: m.admin_workload_metrics_column_workloads(),
        key: "workloadCount",
        renderCell: (row) => row.workloadCount.toLocaleString(),
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

  if (userRows.length === 0) {
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
        title={m.admin_workload_metrics_top_users_title()}
      />
      <Card>
        <Table<UserMetricRow>
          columns={columns}
          data={userRows}
          density="compact"
          dividers="rows"
          hasHover
          idKey="userId"
        />
      </Card>
    </VStack>
  );
};

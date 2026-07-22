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
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import { groupByUser, topByIncrease } from "../model/aggregate";
import { formatDateTime, formatSiNumber } from "../model/format";
import type { UserMetricRow, WorkloadMetricRow } from "../model/types";
import { MetricBarChart } from "./metric-bar-chart";
import { MetricTimelineChart } from "./metric-timeline-chart";

const TOP_N = 8;

export const ByUserView = ({
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const userRows = useMemo(
    () => groupByUser(rows).toSorted((a, b) => b.increase - a.increase),
    [rows]
  );

  const selectedUser = userRows.find((row) => row.userId === selectedUserId);

  const userTimeline = useQuery(
    api.metrics.queries.getWorkloadMetricsTimeline,
    selectedUserId
      ? { bucketMs, endTime, metric, startTime, userId: selectedUserId }
      : "skip"
  );

  const chartData = useMemo(
    () =>
      topByIncrease(userRows, TOP_N).map((row) => ({
        label: row.userEmail,
        value: row.increase,
      })),
    [userRows]
  );

  // Data-driven Table mode has no per-row onClick prop — a whole-row click
  // target needs a transformBodyRow plugin instead (same pattern as
  // admin-clusters' clusters-page.tsx and by-workload-view.tsx), otherwise a
  // per-cell handler would leave each cell's own padding as a dead zone.
  const rowClickPlugin: TablePlugin<UserMetricRow> = useMemo(
    () => ({
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: () => setSelectedUserId(item.userId),
          style: { ...props.htmlProps.style, cursor: "pointer" },
        },
      }),
    }),
    []
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
      {selectedUser ? (
        <VStack gap={3}>
          <Button
            icon={<Icon icon={ArrowLeftIcon} size="sm" />}
            label={m.admin_workload_metrics_user_timeline_back()}
            onClick={() => setSelectedUserId(null)}
            variant="secondary"
          />
          <MetricTimelineChart
            bucketMs={bucketMs}
            isLoading={userTimeline === undefined}
            points={userTimeline ?? []}
            title={m.admin_workload_metrics_user_timeline_title({
              name: selectedUser.userEmail,
            })}
          />
        </VStack>
      ) : (
        <MetricBarChart
          data={chartData}
          title={m.admin_workload_metrics_top_users_title()}
        />
      )}
      <Card>
        <VStack gap={2}>
          <Text color="secondary" type="supporting">
            {m.admin_workload_metrics_row_hint()}
          </Text>
          <Table<UserMetricRow>
            columns={columns}
            data={userRows}
            density="compact"
            dividers="rows"
            hasHover
            idKey="userId"
            plugins={{ rowClick: rowClickPlugin }}
          />
        </VStack>
      </Card>
    </VStack>
  );
};

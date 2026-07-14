import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Popover } from "@astryxdesign/core/Popover";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import type { ResizableProps } from "@astryxdesign/core/Resizable";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { TableColumn } from "@astryxdesign/core/Table";
import {
  pixel,
  proportional,
  resolveColumnWidths,
  Table,
  TableCell,
  TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Fragment, useMemo, useState } from "react";
import { m } from "@/paraglide/messages";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/_authed/admin/clusters")({
  component: ClustersPage,
});

const groupHeaderCell: React.CSSProperties = {
  backgroundColor: "var(--color-background-muted)",
  cursor: "pointer",
  padding: "var(--spacing-3) var(--spacing-4)",
};

const CLUSTER_WORKLOAD_FIELD_DEFS = [
  { key: "clusterName", label: m.admin_field_cluster(), type: "string" },
  { key: "userEmail", label: m.admin_field_user(), type: "string" },
  { key: "createdAt", label: m.admin_field_date(), type: "date" },
  { key: "name", label: m.admin_field_workload(), type: "string" },
  { key: "templateId", label: m.admin_field_template(), type: "string" },
] as const;

type GroupByField = "cluster" | "user";

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { label: m.admin_field_cluster(), value: "cluster" },
  { label: m.admin_field_user(), value: "user" },
];

function statusLabel(status: "active" | "unreachable"): string {
  return status === "active"
    ? m.admin_status_active()
    : m.admin_status_unreachable();
}

interface ClusterWorkloadRow extends Record<string, unknown> {
  _id: Id<"workloads">;
  clusterId: Id<"operators">;
  clusterName: string;
  createdAt: number;
  name: string;
  namespace: string;
  templateId: string;
  userEmail: string;
}

interface WorkloadGroup {
  key: string;
  label: string;
  rows: ClusterWorkloadRow[];
  status?: "active" | "unreachable";
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function WorkloadDetailPanel({
  onClose,
  resizable,
  workload,
}: {
  onClose: () => void;
  resizable: ResizableProps;
  workload: ClusterWorkloadRow | null;
}) {
  if (!workload) {
    return null;
  }
  return (
    <LayoutPanel
      hasDivider
      isScrollable
      label={m.admin_workload_details_label()}
      padding={4}
      resizable={resizable}
    >
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text color="secondary" type="supporting">
              {workload.namespace}
            </Text>
          </StackItem>
          <Button
            icon={<Icon icon={XMarkIcon} size="sm" />}
            isIconOnly
            label={m.close_panel()}
            onClick={onClose}
            size="sm"
            variant="ghost"
          />
        </HStack>

        <Heading level={3}>{workload.name}</Heading>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label={m.admin_field_cluster()}>
            {workload.clusterName}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_template()}>
            {workload.templateId}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_namespace()}>
            {workload.namespace}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_user()}>
            {workload.userEmail}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_created()}>
            {formatDate(workload.createdAt)}
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </LayoutPanel>
  );
}

function ClustersPage() {
  const clusters = useQuery(api.admin.queries.listClusters);
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
  const [groupBy, setGroupBy] = useState<GroupByField>("cluster");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [selectedWorkload, setSelectedWorkload] =
    useState<ClusterWorkloadRow | null>(null);
  // Group keys mean something different across cluster/user grouping — reset
  // stale collapsed state during render (rather than an Effect) when the
  // grouping mode changes, per React's "adjusting state on prop/state change"
  // pattern.
  const [prevGroupBy, setPrevGroupBy] = useState(groupBy);
  if (groupBy !== prevGroupBy) {
    setPrevGroupBy(groupBy);
    setCollapsedGroups(new Set());
  }

  const { config, applyFilters } = usePowerSearchConfig(
    CLUSTER_WORKLOAD_FIELD_DEFS,
    "ClusterWorkloadSearch"
  );

  const rows = useMemo<ClusterWorkloadRow[]>(
    () =>
      (clusters ?? []).flatMap((cluster) =>
        cluster.workloads.map((workload) => ({
          _id: workload._id,
          clusterId: cluster._id,
          clusterName: cluster.name,
          createdAt: workload.createdAt,
          name: workload.name,
          namespace: workload.namespace,
          templateId: workload.templateId,
          userEmail: workload.userEmail,
        }))
      ),
    [clusters]
  );

  const filteredRows = applyFilters(filters, rows);

  const groups = useMemo<WorkloadGroup[]>(() => {
    if (groupBy === "user") {
      const byUser = new Map<string, ClusterWorkloadRow[]>();
      for (const row of filteredRows) {
        const forUser = byUser.get(row.userEmail) ?? [];
        forUser.push(row);
        byUser.set(row.userEmail, forUser);
      }
      return [...byUser.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([userEmail, userRows]) => ({
          key: userEmail,
          label: userEmail,
          rows: userRows,
        }));
    }

    // Anchored on every known cluster (not just ones with filter matches) so
    // an empty cluster still shows up when there's no active search.
    const withMatches = (clusters ?? []).map((cluster) => ({
      key: cluster._id as string,
      label: cluster.name,
      rows: filteredRows.filter((row) => row.clusterId === cluster._id),
      status: cluster.status,
    }));
    return filters.length === 0
      ? withMatches
      : withMatches.filter((group) => group.rows.length > 0);
  }, [clusters, filteredRows, filters.length, groupBy]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const columns = useMemo<TableColumn<ClusterWorkloadRow>[]>(
    () => [
      { header: m.admin_field_workload(), key: "name", width: proportional(1) },
      {
        header: m.admin_field_template(),
        key: "templateId",
        width: pixel(140),
      },
      {
        header: m.admin_field_namespace(),
        key: "namespace",
        width: pixel(140),
      },
      groupBy === "cluster"
        ? { header: m.admin_field_user(), key: "userEmail", width: pixel(220) }
        : {
            header: m.admin_field_cluster(),
            key: "clusterName",
            width: pixel(180),
          },
      { header: m.admin_field_created(), key: "createdAt", width: pixel(120) },
    ],
    [groupBy]
  );

  const columnCount = columns.length;
  const resolvedWidths = resolveColumnWidths(columns);
  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

  if (clusters === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_clusters_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Card height="100%" padding={0}>
        <Layout
          content={
            <LayoutContent padding={0} role="main">
              {groups.length === 0 ? (
                <Center axis="both" style={{ minHeight: 240 }}>
                  <EmptyState
                    description={m.admin_clusters_empty_description()}
                    title={m.admin_clusters_empty_title()}
                  />
                </Center>
              ) : (
                <Table<ClusterWorkloadRow>
                  columns={columns}
                  density="balanced"
                  dividers="rows"
                  hasHover
                  textOverflow="truncate"
                >
                  <colgroup>
                    {columns.map((column) => (
                      <col
                        key={column.key}
                        style={resolvedWidths.columns.get(column.key)?.style}
                      />
                    ))}
                  </colgroup>
                  {groups.map((group) => {
                    const isCollapsed = collapsedGroups.has(group.key);
                    const emptyGroupLabel =
                      groupBy === "cluster"
                        ? m.admin_clusters_empty_cluster_group()
                        : m.admin_clusters_empty_user_group();
                    let bodyRows: React.ReactNode = null;
                    if (!isCollapsed) {
                      bodyRows =
                        group.rows.length > 0 ? (
                          group.rows.map((row) => (
                            <TableRow
                              key={row._id}
                              onClick={() => setSelectedWorkload(row)}
                            >
                              <TableCell>
                                <Text maxLines={1} type="body">
                                  {row.name}
                                </Text>
                              </TableCell>
                              <TableCell>
                                <Text color="secondary" type="supporting">
                                  {row.templateId}
                                </Text>
                              </TableCell>
                              <TableCell>
                                <Text color="secondary" type="supporting">
                                  {row.namespace}
                                </Text>
                              </TableCell>
                              <TableCell>
                                <Text color="secondary" type="supporting">
                                  {groupBy === "cluster"
                                    ? row.userEmail
                                    : row.clusterName}
                                </Text>
                              </TableCell>
                              <TableCell>
                                <Text color="secondary" type="supporting">
                                  {formatDate(row.createdAt)}
                                </Text>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={columnCount}>
                              <Text color="secondary" type="supporting">
                                {emptyGroupLabel}
                              </Text>
                            </TableCell>
                          </TableRow>
                        );
                    }
                    return (
                      <Fragment key={group.key}>
                        <TableRow
                          onClick={() => toggleGroup(group.key)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleGroup(group.key);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <TableCell
                            colSpan={columnCount}
                            style={groupHeaderCell}
                          >
                            <HStack gap={2} vAlign="center">
                              <Icon
                                color="secondary"
                                icon={
                                  isCollapsed
                                    ? ChevronRightIcon
                                    : ChevronDownIcon
                                }
                                size="sm"
                              />
                              {group.status ? (
                                <StatusDot
                                  isPulsing={group.status === "active"}
                                  label={statusLabel(group.status)}
                                  variant={
                                    group.status === "active"
                                      ? "success"
                                      : "error"
                                  }
                                />
                              ) : null}
                              <Text type="body" weight="bold">
                                {group.label}
                              </Text>
                              <Badge
                                label={String(group.rows.length)}
                                variant="neutral"
                              />
                            </HStack>
                          </TableCell>
                        </TableRow>
                        {bodyRows}
                      </Fragment>
                    );
                  })}
                </Table>
              )}
            </LayoutContent>
          }
          end={
            selectedWorkload && (
              <>
                <ResizeHandle
                  isAlwaysVisible={false}
                  isReversed
                  resizable={detailPanel.props}
                />
                <WorkloadDetailPanel
                  onClose={() => setSelectedWorkload(null)}
                  resizable={detailPanel.props}
                  workload={selectedWorkload}
                />
              </>
            )
          }
          header={
            <LayoutHeader hasDivider padding={4}>
              <VStack gap={4}>
                <HStack gap={3} vAlign="center">
                  <StackItem size="fill">
                    <Heading level={1}>{m.nav_clusters()}</Heading>
                  </StackItem>
                  <Button
                    isDisabled
                    label={m.admin_clusters_new()}
                    onClick={() => {
                      /* cluster creation isn't wired up yet */
                    }}
                    variant="primary"
                  />
                </HStack>
                <HStack gap={2} vAlign="center">
                  <StackItem size="fill">
                    <PowerSearch
                      config={config}
                      filters={filters}
                      onChange={(newFilters) => setFilters([...newFilters])}
                      placeholder={m.admin_clusters_search_placeholder()}
                      resultCount={m.admin_clusters_result_count({
                        count: filteredRows.length,
                      })}
                    />
                  </StackItem>
                  <Popover
                    alignment="end"
                    content={
                      <VStack gap={4}>
                        <RadioList
                          label={m.admin_clusters_group_by_label()}
                          onChange={(value) =>
                            setGroupBy(value as GroupByField)
                          }
                          value={groupBy}
                        >
                          {GROUP_BY_OPTIONS.map((option) => (
                            <RadioListItem
                              key={option.value}
                              label={option.label}
                              value={option.value}
                            />
                          ))}
                        </RadioList>
                      </VStack>
                    }
                    label={m.admin_clusters_grouping_options_label()}
                    placement="below"
                    width={320}
                  >
                    <Button label={m.view_options()} variant="secondary" />
                  </Popover>
                </HStack>
              </VStack>
            </LayoutHeader>
          }
          height="fill"
        />
      </Card>
    </Section>
  );
}

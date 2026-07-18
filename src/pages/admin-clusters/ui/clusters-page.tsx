import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Popover } from "@astryxdesign/core/Popover";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
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
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "convex/react";
import type { CSSProperties, ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import {
  formatDate,
  healthStatusLabel,
  healthStatusVariant,
  workloadStatusIsPulsing,
  workloadStatusLabel,
  workloadStatusVariant,
  WORKLOAD_STATUS_OPTIONS,
} from "../model/format";
import type {
  ClusterFormMode,
  ClusterFormState,
  ClusterSummary,
  ClusterWorkloadRow,
  GroupByField,
  WorkloadGroup,
} from "../model/types";
import { toClusterSummary } from "../model/types";
import { ClusterDetailPanel } from "./cluster-detail-panel";
import { ClusterFormDialog } from "./cluster-form-dialog";
import { TokenRevealDialog } from "./token-reveal-dialog";
import { WorkloadDetailPanel } from "./workload-detail-panel";

import styles from "./clusters-page.module.css";

const groupHeaderCell: CSSProperties = {
  backgroundColor: "var(--color-background-muted)",
  cursor: "pointer",
  padding: "var(--spacing-3) var(--spacing-4)",
};

const CLUSTER_WORKLOAD_FIELD_DEFS = [
  { key: "clusterName", label: m.admin_field_cluster(), type: "string" },
  { key: "userEmail", label: m.admin_field_user(), type: "string" },
  { key: "createdAt", label: m.admin_field_date(), type: "date" },
  { key: "displayName", label: m.admin_field_workload(), type: "string" },
  { key: "templateId", label: m.admin_field_template(), type: "string" },
  {
    enumValues: WORKLOAD_STATUS_OPTIONS,
    key: "status",
    label: m.admin_field_status(),
    type: "enum",
  },
] as const;

const DEFAULT_FILTERS: PowerSearchFilter[] = [
  {
    field: "status",
    operator: "is_not",
    value: { type: "enum", value: "destroyed" },
  },
];

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { label: m.admin_clusters_group_by_none(), value: "none" },
  { label: m.admin_field_cluster(), value: "cluster" },
  { label: m.admin_field_user(), value: "user" },
];

type DetailSelection =
  | { kind: "workload"; workload: ClusterWorkloadRow }
  | { kind: "cluster"; cluster: ClusterSummary }
  | null;

const EMPTY_CLUSTER_FORM: ClusterFormState = {
  description: "",
  name: "",
  region: "",
  retentionPolicy: "standard",
  tags: [],
};

// Stable empty-array reference for the `?? []` fallback below — a fresh
// `[]` literal there would break the `rows` useMemo's dependency check
// (react-hooks/exhaustive-deps) by changing identity every render while
// `fleet` is still loading.
const EMPTY_WORKLOADS: NonNullable<
  ReturnType<typeof useQuery<typeof api.admin.queries.listClusters>>
>["unclaimedWorkloads"] = [];

export const ClustersPage = () => {
  const fleet = useQuery(api.admin.queries.listClusters);
  const clusters = fleet?.clusters;
  const unclaimedWorkloads = fleet?.unclaimedWorkloads ?? EMPTY_WORKLOADS;
  const createCluster = useMutation(api.admin.mutations.createCluster);
  const updateCluster = useMutation(api.admin.mutations.updateCluster);
  const rerollEnrollmentToken = useMutation(
    api.admin.mutations.rerollEnrollmentToken
  );
  const deleteCluster = useMutation(api.admin.mutations.deleteCluster);

  const [filters, setFilters] = useState<PowerSearchFilter[]>(DEFAULT_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupByField>("cluster");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [detailSelection, setDetailSelection] = useState<DetailSelection>(null);
  // Group keys mean something different across cluster/user grouping — reset
  // stale collapsed state during render (rather than an Effect) when the
  // grouping mode changes, per React's "adjusting state on prop/state change"
  // pattern.
  const [prevGroupBy, setPrevGroupBy] = useState(groupBy);
  if (groupBy !== prevGroupBy) {
    setPrevGroupBy(groupBy);
    setCollapsedGroups(new Set());
  }

  const [clusterForm, setClusterForm] = useState<{
    mode: ClusterFormMode;
    state: ClusterFormState;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<{
    clusterName: string;
    token: string;
  } | null>(null);
  const rerollAlert = useImperativeAlertDialog();
  const deleteAlert = useImperativeAlertDialog();

  const { config, applyFilters } = usePowerSearchConfig(
    CLUSTER_WORKLOAD_FIELD_DEFS,
    "ClusterWorkloadSearch"
  );

  const rows = useMemo<ClusterWorkloadRow[]>(
    () => [
      ...(clusters ?? []).flatMap((cluster) =>
        cluster.workloads.map((workload) => ({
          _id: workload._id,
          clusterId: cluster._id,
          clusterName: cluster.name,
          createdAt: workload.createdAt,
          displayName: workload.displayName,
          failureReason: workload.failureReason,
          name: workload.name,
          namespace: workload.namespace,
          status: workload.status,
          templateId: workload.templateId,
          userEmail: workload.userEmail,
        }))
      ),
      // Freshly `requested` rows have no operatorId yet (no operator has
      // claimed them), so they can't belong to any real cluster group —
      // surfaced under a synthetic "Unclaimed" bucket instead of silently
      // vanishing from this page (see admin/queries.ts#listClusters).
      ...unclaimedWorkloads.map((workload) => ({
        _id: workload._id,
        clusterName: m.admin_clusters_unclaimed(),
        createdAt: workload.createdAt,
        displayName: workload.displayName,
        failureReason: workload.failureReason,
        name: workload.name,
        namespace: workload.namespace,
        status: workload.status,
        templateId: workload.templateId,
        userEmail: workload.userEmail,
      })),
    ],
    [clusters, unclaimedWorkloads]
  );

  const filteredRows = applyFilters(filters, rows);

  const clustersById = useMemo(
    () =>
      new Map(
        (clusters ?? []).map((cluster) => [
          cluster._id,
          toClusterSummary(cluster),
        ])
      ),
    [clusters]
  );

  const groups = useMemo<WorkloadGroup[]>(() => {
    if (groupBy === "none") {
      return [];
    }
    if (groupBy === "user") {
      const byUser = new Map<string, ClusterWorkloadRow[]>();
      for (const row of filteredRows) {
        const forUser = byUser.get(row.userEmail) ?? [];
        forUser.push(row);
        byUser.set(row.userEmail, forUser);
      }
      return (
        [...byUser.entries()]
          // oxlint-disable-next-line unicorn/no-array-sort -- the spread just above already makes this a fresh array; sorting it in place mutates no shared state. (toSorted() would need an ES2023 lib bump, out of scope here.)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([userEmail, userRows]) => ({
            key: userEmail,
            label: userEmail,
            rows: userRows,
          }))
      );
    }

    // Anchored on every known cluster (not just ones with filter matches) so
    // an empty cluster still shows up when there's no active search.
    const withMatches: WorkloadGroup[] = (clusters ?? []).map((cluster) => ({
      cluster: toClusterSummary(cluster),
      key: cluster._id as string,
      label: cluster.name,
      rows: filteredRows.filter((row) => row.clusterId === cluster._id),
    }));
    // Synthetic group for rows with no clusterId at all (freshly `requested`,
    // not yet claimed by any operator) — not "anchored" like a real cluster
    // since there's no permanent bucket to show when it's empty and there's
    // no active search.
    withMatches.push({
      key: "__unclaimed__",
      label: m.admin_clusters_unclaimed(),
      rows: filteredRows.filter((row) => !row.clusterId),
    });
    return withMatches.filter(
      (group) => filters.length === 0 || group.rows.length > 0
    );
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

  const openCreateDialog = () => {
    setFormError(null);
    setClusterForm({ mode: { kind: "create" }, state: EMPTY_CLUSTER_FORM });
  };

  const openEditDialog = (cluster: ClusterSummary) => {
    setFormError(null);
    setClusterForm({
      mode: { kind: "edit", operatorId: cluster._id },
      state: {
        description: cluster.description ?? "",
        name: cluster.name,
        region: cluster.region ?? "",
        retentionPolicy: cluster.retentionPolicy,
        tags: cluster.tags,
      },
    });
  };

  const closeClusterForm = () => {
    setClusterForm(null);
    setFormError(null);
  };

  const handleClusterFormSubmit = async () => {
    if (!clusterForm) {
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      if (clusterForm.mode.kind === "create") {
        const { enrollmentToken } = await createCluster({
          description: clusterForm.state.description || undefined,
          name: clusterForm.state.name,
          region: clusterForm.state.region || undefined,
          retentionPolicy: clusterForm.state.retentionPolicy,
          tags: clusterForm.state.tags,
        });
        setRevealedToken({
          clusterName: clusterForm.state.name,
          token: enrollmentToken,
        });
      } else {
        await updateCluster({
          description: clusterForm.state.description || undefined,
          name: clusterForm.state.name,
          operatorId: clusterForm.mode.operatorId,
          region: clusterForm.state.region || undefined,
          retentionPolicy: clusterForm.state.retentionPolicy,
          tags: clusterForm.state.tags,
        });
      }
      setClusterForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmReroll = (cluster: ClusterSummary) => {
    rerollAlert.show({
      actionLabel: m.admin_clusters_reroll_confirm_action(),
      description: m.admin_clusters_reroll_confirm_description({
        name: cluster.name,
      }),
      onAction: async () => {
        const { enrollmentToken } = await rerollEnrollmentToken({
          operatorId: cluster._id,
        });
        rerollAlert.hide();
        setRevealedToken({ clusterName: cluster.name, token: enrollmentToken });
      },
      title: m.admin_clusters_reroll_confirm_title(),
    });
  };

  const confirmDelete = (cluster: ClusterSummary) => {
    deleteAlert.show({
      actionLabel: m.admin_clusters_delete_confirm_action(),
      description: m.admin_clusters_delete_confirm_description({
        name: cluster.name,
      }),
      onAction: async () => {
        await deleteCluster({ operatorId: cluster._id });
        deleteAlert.hide();
      },
      title: m.admin_clusters_delete_confirm_title(),
    });
  };

  const columns = useMemo<TableColumn<ClusterWorkloadRow>[]>(() => {
    const base: TableColumn<ClusterWorkloadRow>[] = [
      { header: m.admin_field_workload(), key: "name", width: proportional(1) },
      { header: m.admin_field_status(), key: "status", width: pixel(160) },
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
    ];
    const clusterColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_cluster(),
      key: "clusterName",
      width: pixel(180),
    };
    const userColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_user(),
      key: "userEmail",
      width: pixel(220),
    };
    const createdColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_created(),
      key: "createdAt",
      width: pixel(120),
    };
    if (groupBy === "none") {
      return [...base, clusterColumn, userColumn, createdColumn];
    }
    if (groupBy === "cluster") {
      return [...base, userColumn, createdColumn];
    }
    return [...base, clusterColumn, createdColumn];
  }, [groupBy]);

  const columnCount = columns.length;
  const resolvedWidths = resolveColumnWidths(columns);
  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

  // Shared by the flat "none" list and every group's body rows below — the
  // cluster/user cells are the only thing that vary per grouping mode (see
  // `columns` above), everything else renders identically either way.
  const renderWorkloadRow = (
    row: ClusterWorkloadRow,
    { showCluster, showUser }: { showCluster: boolean; showUser: boolean }
  ) => {
    const { clusterId } = row;
    return (
      <TableRow
        key={row._id}
        onClick={() => setDetailSelection({ kind: "workload", workload: row })}
      >
        <TableCell>
          <Text maxLines={1} type="body">
            {row.displayName}
          </Text>
        </TableCell>
        <TableCell>
          <HStack gap={2} vAlign="center">
            <StatusDot
              isPulsing={workloadStatusIsPulsing(row.status)}
              label={workloadStatusLabel(row.status)}
              tooltip={row.failureReason}
              variant={workloadStatusVariant(row.status)}
            />
            {/* StatusDot's `label` is aria-only — it renders no visible
                text on its own. */}
            <Text color="secondary" type="supporting">
              {workloadStatusLabel(row.status)}
            </Text>
          </HStack>
        </TableCell>
        <TableCell>
          <Text color="secondary" type="supporting">
            {row.templateId}
          </Text>
        </TableCell>
        <TableCell>
          <Text color="secondary" type="supporting">
            {row.namespace ?? "—"}
          </Text>
        </TableCell>
        {showCluster ? (
          <TableCell>
            {clusterId ? (
              <Link
                onClick={(event) => {
                  event.stopPropagation();
                  const cluster = clustersById.get(clusterId);
                  if (cluster) {
                    setDetailSelection({ cluster, kind: "cluster" });
                  }
                }}
              >
                {row.clusterName}
              </Link>
            ) : (
              <Text color="secondary" type="supporting">
                {row.clusterName}
              </Text>
            )}
          </TableCell>
        ) : null}
        {showUser ? (
          <TableCell>
            <Text color="secondary" type="supporting">
              {row.userEmail}
            </Text>
          </TableCell>
        ) : null}
        <TableCell>
          <Text color="secondary" type="supporting">
            {formatDate(row.createdAt)}
          </Text>
        </TableCell>
      </TableRow>
    );
  };

  const isEmpty =
    groupBy === "none" ? filteredRows.length === 0 : groups.length === 0;

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
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
            <LayoutContent padding={0} role="main">
              {isEmpty ? (
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
                  {groupBy === "none" ? (
                    <>
                      <TableHeader>
                        <TableRow isHeaderRow>
                          {columns.map((column) => (
                            <TableHeaderCell
                              key={column.key}
                              style={
                                resolvedWidths.columns.get(column.key)?.style
                              }
                            >
                              {column.header}
                            </TableHeaderCell>
                          ))}
                        </TableRow>
                      </TableHeader>
                      {filteredRows.map((row) =>
                        renderWorkloadRow(row, {
                          showCluster: true,
                          showUser: true,
                        })
                      )}
                    </>
                  ) : (
                    groups.map((group) => {
                      const isCollapsed = collapsedGroups.has(group.key);
                      const { cluster } = group;
                      const emptyGroupLabel =
                        groupBy === "cluster"
                          ? m.admin_clusters_empty_cluster_group()
                          : m.admin_clusters_empty_user_group();
                      let bodyRows: ReactNode = null;
                      if (!isCollapsed) {
                        bodyRows =
                          group.rows.length > 0 ? (
                            group.rows.map((row) =>
                              renderWorkloadRow(row, {
                                showCluster: groupBy === "user",
                                showUser: groupBy === "cluster",
                              })
                            )
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
                            className={styles.groupHeaderRow}
                            onClick={() => toggleGroup(group.key)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleGroup(group.key);
                              }
                            }}
                            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- TableRow renders a <tr>; a real <button> isn't a valid table-row replacement, so role="button" is the correct a11y signal for this clickable header row.
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
                                {cluster ? (
                                  <StatusDot
                                    isPulsing={
                                      cluster.healthStatus === "healthy"
                                    }
                                    label={healthStatusLabel(
                                      cluster.healthStatus
                                    )}
                                    variant={healthStatusVariant(
                                      cluster.healthStatus
                                    )}
                                  />
                                ) : null}
                                <Text type="body" weight="bold">
                                  {group.label}
                                </Text>
                                <Badge
                                  label={String(group.rows.length)}
                                  variant="neutral"
                                />
                                {cluster ? (
                                  <>
                                    <StackItem size="fill" />
                                    <HStack
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      onKeyDown={(event) =>
                                        event.stopPropagation()
                                      }
                                    >
                                      <IconButton
                                        className={styles.groupActionButton}
                                        icon={
                                          <Icon
                                            icon={InformationCircleIcon}
                                            size="sm"
                                          />
                                        }
                                        label={m.admin_clusters_view_details()}
                                        onClick={() =>
                                          setDetailSelection({
                                            cluster,
                                            kind: "cluster",
                                          })
                                        }
                                        size="sm"
                                        variant="ghost"
                                      />
                                    </HStack>
                                  </>
                                ) : null}
                              </HStack>
                            </TableCell>
                          </TableRow>
                          {bodyRows}
                        </Fragment>
                      );
                    })
                  )}
                </Table>
              )}
            </LayoutContent>
          }
          end={
            detailSelection && (
              <>
                <ResizeHandle
                  isAlwaysVisible={false}
                  isReversed
                  resizable={detailPanel.props}
                />
                {detailSelection.kind === "workload" ? (
                  <WorkloadDetailPanel
                    onClose={() => setDetailSelection(null)}
                    resizable={detailPanel.props}
                    workload={detailSelection.workload}
                  />
                ) : (
                  <ClusterDetailPanel
                    cluster={detailSelection.cluster}
                    onClose={() => setDetailSelection(null)}
                    onDelete={confirmDelete}
                    onEdit={openEditDialog}
                    onReroll={confirmReroll}
                    resizable={detailPanel.props}
                  />
                )}
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
                  <DropdownMenu
                    button={{
                      label: m.admin_clusters_new(),
                      variant: "primary",
                    }}
                    items={[
                      {
                        label: m.admin_clusters_add_cluster(),
                        onClick: openCreateDialog,
                      },
                      {
                        isDisabled: true,
                        label: m.admin_clusters_add_workload(),
                      },
                    ]}
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

      <ClusterFormDialog
        error={formError}
        formState={clusterForm?.state ?? null}
        isSubmitting={isSubmitting}
        mode={clusterForm?.mode ?? null}
        onChange={(state) =>
          setClusterForm((prev) => (prev ? { ...prev, state } : prev))
        }
        onClose={closeClusterForm}
        onSubmit={handleClusterFormSubmit}
      />
      <TokenRevealDialog
        onClose={() => setRevealedToken(null)}
        revealed={revealedToken}
      />
      {rerollAlert.element}
      {deleteAlert.element}
    </Section>
  );
};

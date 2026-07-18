import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
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
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import {
  pixel,
  resolveColumnWidths,
  Table,
  TableCell,
  TableRow,
  useTableColumnResize,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";
import { useAction, useMutation, useQuery } from "convex/react";
import type { CSSProperties, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";

import type {
  CatalogOperation,
  CatalogTemplate,
} from "@/entities/catalog-parameter";
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
import { WorkloadOperationDialog } from "./workload-operation-dialog";
import { WorkloadRedeployDialog } from "./workload-redeploy-dialog";

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
  const adminRequestStop = useMutation(api.admin.mutations.adminRequestStop);
  const adminRequestResume = useMutation(
    api.admin.mutations.adminRequestResume
  );
  const adminRequestDestroy = useMutation(
    api.admin.mutations.adminRequestDestroy
  );
  const adminGetCatalog = useAction(api.admin.actions.adminGetCatalog);
  const adminRequestRedeploy = useAction(
    api.admin.actions.adminRequestRedeploy
  );
  const adminRunOperation = useAction(api.admin.actions.adminRunOperation);
  const adminGetWorkloadAccessToken = useAction(
    api.admin.actions.adminGetWorkloadAccessToken
  );

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
  const destroyWorkloadAlert = useImperativeAlertDialog();

  // Fetched only for the currently-selected `active` workload (redeploy and
  // catalog operations are only ever offered on one) — keyed to whichever
  // workload the panel is showing, refetched whenever that changes.
  const [workloadCatalog, setWorkloadCatalog] = useState<
    CatalogTemplate[] | null
  >(null);
  const [activeOperation, setActiveOperation] = useState<{
    operation: CatalogOperation;
    workload: ClusterWorkloadRow;
  } | null>(null);
  const [activeRedeploy, setActiveRedeploy] =
    useState<ClusterWorkloadRow | null>(null);

  const selectedWorkload =
    detailSelection?.kind === "workload" ? detailSelection.workload : null;

  useEffect(() => {
    // Only an `active` row can redeploy or run a catalog operation — no
    // catalog fetch worth making otherwise (mirrors src/pages/workloads/ui/
    // workloads-page.tsx's operationsFor/entrypointsFor status guard).
    if (!selectedWorkload || selectedWorkload.status !== "active") {
      setWorkloadCatalog(null);
      return;
    }
    let cancelled = false;
    adminGetCatalog({ workloadId: selectedWorkload._id })
      .then((templates) => {
        if (!cancelled) {
          setWorkloadCatalog(templates);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkloadCatalog(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWorkload, adminGetCatalog]);

  const selectedWorkloadTemplate: CatalogTemplate | null = selectedWorkload
    ? (workloadCatalog?.find((t) => t.id === selectedWorkload.templateId) ??
      null)
    : null;

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
          config: workload.config,
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
        config: workload.config,
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

  // No confirm dialog for stop/resume — reversible, unlike destroy, so
  // there's nothing here that "cannot be undone" (mirrors src/pages/
  // workloads/ui/workloads-page.tsx's handleStop/handleResume).
  const handleStopWorkload = (workload: ClusterWorkloadRow) => {
    void adminRequestStop({ workloadId: workload._id });
  };

  const handleResumeWorkload = (workload: ClusterWorkloadRow) => {
    void adminRequestResume({ workloadId: workload._id });
  };

  const confirmDestroyWorkload = (workload: ClusterWorkloadRow) => {
    const isDismiss = workload.status === "failed";
    destroyWorkloadAlert.show({
      actionLabel: isDismiss
        ? m.admin_workload_dismiss_confirm_action()
        : m.admin_workload_destroy_confirm_action(),
      description: isDismiss
        ? m.admin_workload_dismiss_confirm_description({
            name: workload.displayName,
          })
        : m.admin_workload_destroy_confirm_description({
            name: workload.displayName,
          }),
      onAction: async () => {
        try {
          await adminRequestDestroy({ workloadId: workload._id });
        } finally {
          destroyWorkloadAlert.hide();
        }
      },
      title: isDismiss
        ? m.admin_workload_dismiss_confirm_title()
        : m.admin_workload_destroy_confirm_title(),
    });
  };

  const openWorkloadRedeployDialog = (workload: ClusterWorkloadRow) => {
    setActiveRedeploy(workload);
  };

  const closeWorkloadRedeployDialog = () => {
    setActiveRedeploy(null);
  };

  const openWorkloadOperationDialog = (
    workload: ClusterWorkloadRow,
    operation: CatalogOperation
  ) => {
    setActiveOperation({ operation, workload });
  };

  const closeWorkloadOperationDialog = () => {
    setActiveOperation(null);
  };

  // Mirrors src/pages/workloads/ui/workloads-page.tsx's handleOpen —
  // entrypoint is a mandatory path segment; the gateway auth token/cookie
  // exchange is unaffected by acting as an admin (see convex/admin/
  // actions.ts#adminGetWorkloadAccessToken's doc comment).
  const handleOpenWorkload = async (
    workload: ClusterWorkloadRow,
    entrypointName: string
  ) => {
    const { externalUrl, name, token } = await adminGetWorkloadAccessToken({
      workloadId: workload._id,
    });
    window.open(
      `${externalUrl}/gw/${name}/${entrypointName}/?token=${encodeURIComponent(token)}`,
      "_blank"
    );
  };

  const redeployTemplate: CatalogTemplate | null = activeRedeploy
    ? (workloadCatalog?.find((t) => t.id === activeRedeploy.templateId) ??
      null)
    : null;

  const columns = useMemo<TableColumn<ClusterWorkloadRow>[]>(() => {
    const nameColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_workload(),
      key: "name",
      renderCell: (row) => (
        <HStack gap={2} vAlign="center">
          <StatusDot
            isPulsing={workloadStatusIsPulsing(row.status)}
            label={workloadStatusLabel(row.status)}
            tooltip={row.failureReason ?? workloadStatusLabel(row.status)}
            variant={workloadStatusVariant(row.status)}
          />
          <Text maxLines={1} type="body">
            {row.displayName}
          </Text>
        </HStack>
      ),
      width: pixel(160),
    };
    const templateColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_template(),
      key: "templateId",
      renderCell: (row) => (
        <Text color="secondary" type="supporting">
          {row.templateId}
        </Text>
      ),
      width: pixel(100),
    };
    const namespaceColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_namespace(),
      key: "namespace",
      renderCell: (row) => (
        <Text color="secondary" type="supporting">
          {row.namespace ?? "—"}
        </Text>
      ),
      width: pixel(120),
    };
    const clusterColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_cluster(),
      key: "clusterName",
      renderCell: (row) => {
        const { clusterId } = row;
        if (!clusterId) {
          return (
            <Text color="secondary" type="supporting">
              {row.clusterName}
            </Text>
          );
        }
        return (
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
        );
      },
      width: pixel(140),
    };
    const userColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_user(),
      key: "userEmail",
      renderCell: (row) => (
        <Text color="secondary" type="supporting">
          {row.userEmail}
        </Text>
      ),
      width: pixel(180),
    };
    const createdColumn: TableColumn<ClusterWorkloadRow> = {
      header: m.admin_field_created(),
      key: "createdAt",
      renderCell: (row) => (
        <Text color="secondary" type="supporting">
          {formatDate(row.createdAt)}
        </Text>
      ),
      width: pixel(100),
    };

    const base = [nameColumn, templateColumn, namespaceColumn];
    if (groupBy === "none") {
      return [...base, clusterColumn, userColumn, createdColumn];
    }
    if (groupBy === "cluster") {
      return [...base, userColumn, createdColumn];
    }
    return [...base, clusterColumn, createdColumn];
  }, [groupBy, clustersById, setDetailSelection]);

  const columnCount = columns.length;
  const resolvedWidths = resolveColumnWidths(columns);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizePlugin = useTableColumnResize<ClusterWorkloadRow>({
    columnWidths,
    // useTableColumnResize only reads key/width/resizable off each column
    // (never calls renderCell), so this cast is safe — its config type just
    // isn't parameterized by the hook's own generic.
    columns: columns as TableColumn<Record<string, unknown>>[],
    onColumnResizeEnd: (updates) =>
      setColumnWidths((prev) => ({ ...prev, ...updates })),
  });
  // Data-driven mode has no row-level onClick prop, so a whole-row click
  // target needs a plugin (transformBodyRow) instead of a per-cell handler
  // — a per-cell handler only covers the rendered content, leaving the
  // cell's padding as a dead zone (the bug the previous Actions-icon
  // workaround was papering over).
  const rowClickPlugin: TablePlugin<ClusterWorkloadRow> = useMemo(
    () => ({
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: () =>
            setDetailSelection({ kind: "workload", workload: item }),
          style: { ...props.htmlProps.style, cursor: "pointer" },
        },
      }),
    }),
    [setDetailSelection]
  );
  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

  const isEmpty =
    groupBy === "none" ? filteredRows.length === 0 : groups.length === 0;

  if (clusters === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_clusters_loading()}</Text>
      </Center>
    );
  }

  let tableRegion: ReactNode;
  if (isEmpty) {
    tableRegion = (
      <Center axis="both" style={{ minHeight: 240 }}>
        <EmptyState
          actions={
            filters.length > 0 ? (
              <Button
                label={m.clear_filters()}
                onClick={() => setFilters([])}
                variant="secondary"
              />
            ) : (
              <Button
                label={m.admin_clusters_add_cluster()}
                onClick={openCreateDialog}
                variant="primary"
              />
            )
          }
          description={m.admin_clusters_empty_description()}
          icon={<Icon icon={ServerStackIcon} size="lg" />}
          title={m.admin_clusters_empty_title()}
        />
      </Center>
    );
  } else if (groupBy === "none") {
    tableRegion = (
      <Table<ClusterWorkloadRow>
        columns={columns}
        data={filteredRows}
        density="balanced"
        dividers="rows"
        hasHover
        idKey="_id"
        plugins={{ resize: resizePlugin, rowClick: rowClickPlugin }}
        textOverflow="truncate"
      />
    );
  } else {
    tableRegion = (
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
          const { cluster } = group;
          const emptyGroupLabel =
            groupBy === "cluster"
              ? m.admin_clusters_empty_cluster_group()
              : m.admin_clusters_empty_user_group();
          let bodyRows: ReactNode = null;
          if (!isCollapsed) {
            bodyRows =
              group.rows.length > 0 ? (
                group.rows.map((row) => (
                  <TableRow
                    key={row._id}
                    onClick={() =>
                      setDetailSelection({ kind: "workload", workload: row })
                    }
                  >
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        {column.renderCell?.(row)}
                      </TableCell>
                    ))}
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
                <TableCell colSpan={columnCount} style={groupHeaderCell}>
                  <HStack gap={2} vAlign="center">
                    <Icon
                      color="secondary"
                      icon={isCollapsed ? ChevronRightIcon : ChevronDownIcon}
                      size="sm"
                    />
                    {cluster ? (
                      <StatusDot
                        isPulsing={cluster.healthStatus === "healthy"}
                        label={healthStatusLabel(cluster.healthStatus)}
                        variant={healthStatusVariant(cluster.healthStatus)}
                      />
                    ) : null}
                    {cluster ? (
                      <Link
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetailSelection({ cluster, kind: "cluster" });
                        }}
                        weight="bold"
                      >
                        {group.label}
                      </Link>
                    ) : (
                      <Text type="body" weight="bold">
                        {group.label}
                      </Text>
                    )}
                    <Badge
                      label={String(group.rows.length)}
                      variant="neutral"
                    />
                    {cluster ? (
                      <>
                        <StackItem size="fill" />
                        <HStack
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <IconButton
                            className={styles.groupActionButton}
                            icon={
                              <Icon icon={InformationCircleIcon} size="sm" />
                            }
                            label={m.admin_clusters_view_details()}
                            onClick={() =>
                              setDetailSelection({ cluster, kind: "cluster" })
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
        })}
      </Table>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Card height="100%" padding={0}>
        <Layout
          content={
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
            <LayoutContent padding={0} role="main">
              {tableRegion}
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
                    entrypoints={selectedWorkloadTemplate?.entrypoints ?? []}
                    onClose={() => setDetailSelection(null)}
                    onDestroy={confirmDestroyWorkload}
                    onOpen={handleOpenWorkload}
                    onRedeploy={openWorkloadRedeployDialog}
                    onResume={handleResumeWorkload}
                    onRunOperation={openWorkloadOperationDialog}
                    onStop={handleStopWorkload}
                    operations={selectedWorkloadTemplate?.operations ?? []}
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
                    <Heading level={1}>{m.nav_fleet()}</Heading>
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
                      popoverSaveButtonLabel={m.apply()}
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
      <Dialog
        isOpen={Boolean(activeRedeploy && redeployTemplate)}
        onOpenChange={(open) => {
          if (!open) {
            closeWorkloadRedeployDialog();
          }
        }}
        purpose="form"
        width={480}
      >
        {activeRedeploy && redeployTemplate ? (
          <Layout
            content={
              <LayoutContent>
                <WorkloadRedeployDialog
                  config={activeRedeploy.config}
                  key={activeRedeploy._id}
                  onClose={closeWorkloadRedeployDialog}
                  onRedeploy={(values) =>
                    adminRequestRedeploy({
                      params: values,
                      workloadId: activeRedeploy._id,
                    })
                  }
                  template={redeployTemplate}
                />
              </LayoutContent>
            }
            header={
              <DialogHeader
                onOpenChange={closeWorkloadRedeployDialog}
                title={m.admin_workload_redeploy_title({
                  name: activeRedeploy.displayName,
                })}
              />
            }
          />
        ) : null}
      </Dialog>
      <Dialog
        isOpen={Boolean(activeOperation)}
        onOpenChange={(open) => {
          if (!open) {
            closeWorkloadOperationDialog();
          }
        }}
        purpose="form"
        width={480}
      >
        {activeOperation ? (
          <Layout
            content={
              <LayoutContent>
                <WorkloadOperationDialog
                  key={`${activeOperation.workload._id}:${activeOperation.operation.key}`}
                  onClose={closeWorkloadOperationDialog}
                  onRun={(values) =>
                    adminRunOperation({
                      operationKey: activeOperation.operation.key,
                      params: values,
                      workloadId: activeOperation.workload._id,
                    })
                  }
                  operation={activeOperation.operation}
                />
              </LayoutContent>
            }
            header={
              <DialogHeader
                onOpenChange={closeWorkloadOperationDialog}
                subtitle={activeOperation.operation.description}
                title={activeOperation.operation.label}
              />
            }
          />
        ) : null}
      </Dialog>
      {rerollAlert.element}
      {deleteAlert.element}
      {destroyWorkloadAlert.element}
    </Section>
  );
};

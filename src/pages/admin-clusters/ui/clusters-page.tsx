import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
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
import type { ResizableProps } from "@astryxdesign/core/Resizable";
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
import { useToast } from "@astryxdesign/core/Toast";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";
import { getRouteApi } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { CSSProperties, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";

import type {
  CatalogOperation,
  CatalogTemplate,
  OperationResult,
} from "@/entities/catalog-parameter";
import { SystemAlertBanners } from "@/entities/notifications";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";
import {
  NewWorkloadDialog,
  WorkloadOperationDialog,
  WorkloadRedeployDialog,
} from "@/widgets/new-workload-dialog";

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

// Carries only the id, not the row/cluster object itself — so the detail
// panel it drives always reflects the LIVE reactive data (see
// workloadById/clusterFromSelection below), not a frozen snapshot from the
// moment it was clicked. A row that keeps changing underneath (heartbeat,
// status transition, admin edit) shows those changes without needing to
// close and reopen the panel.
type DetailSelection =
  | { kind: "workload"; workloadId: Id<"workloads"> }
  | { kind: "cluster"; clusterId: Id<"operators"> }
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
  ReturnType<typeof useQuery<typeof api.operators.queries.listClusters>>
>["unclaimedWorkloads"] = [];

interface SelectedWorkloadCatalog {
  templates: CatalogTemplate[];
  workloadId: Id<"workloads">;
}

// Pulled out of ClustersPage (a separate function/hook has its own
// complexity budget) — only ever refetched for the currently-selected
// `active` workload, since redeploy and catalog operations are only ever
// offered on one.
//
// Takes the id/status primitives rather than the whole (reactive) row: the
// row's `rows` array is rebuilt with fresh object references on every
// listClusters update (any cluster's heartbeat, not just this workload's),
// so depending on the row object itself would refetch the catalog on every
// unrelated live update instead of only when the selection or its status
// actually changes.
const useSelectedWorkloadCatalog = (
  workloadId: Id<"workloads"> | undefined,
  status: ClusterWorkloadRow["status"] | undefined,
  adminGetCatalog: (args: {
    workloadId: Id<"workloads">;
  }) => Promise<CatalogTemplate[]>
): SelectedWorkloadCatalog | null => {
  const [workloadCatalog, setWorkloadCatalog] =
    useState<SelectedWorkloadCatalog | null>(null);

  useEffect(() => {
    if (!workloadId || status !== "active") {
      return;
    }
    let cancelled = false;
    const fetchCatalog = async () => {
      try {
        const templates = await adminGetCatalog({ workloadId });
        if (!cancelled) {
          setWorkloadCatalog({ templates, workloadId });
        }
      } catch {
        // Leave workloadCatalog as-is — findTemplateFor below only ever
        // matches when workloadId equals the CURRENT selection, so a failed
        // fetch just means no operations/redeploy show for this workload,
        // never a stale one from a previous selection.
      }
    };
    fetchCatalog();
    return () => {
      cancelled = true;
    };
  }, [workloadId, status, adminGetCatalog]);

  return workloadCatalog;
};

// Only returns a template when `catalog` was fetched for THIS exact
// workload — a stale catalog from a previously-selected workload (or one
// still in flight for a different selection) never leaks through.
const findTemplateFor = (
  workload: ClusterWorkloadRow | null,
  catalog: SelectedWorkloadCatalog | null
): CatalogTemplate | null => {
  if (!workload || catalog?.workloadId !== workload._id) {
    return null;
  }
  return catalog.templates.find((t) => t.id === workload.templateId) ?? null;
};

// Re-resolved from the live `rows`/`clustersById` on every render (see
// DetailSelection's doc comment) rather than stored as a snapshot — a
// vanished id (e.g. the cluster/workload was deleted) simply resolves to
// null, which both detail panels already render as nothing.
const workloadById = (
  selection: DetailSelection,
  rows: ClusterWorkloadRow[]
): ClusterWorkloadRow | null => {
  if (selection?.kind !== "workload") {
    return null;
  }
  return rows.find((row) => row._id === selection.workloadId) ?? null;
};

const clusterFromSelection = (
  selection: DetailSelection,
  clustersById: Map<Id<"operators">, ClusterSummary>
): ClusterSummary | null => {
  if (selection?.kind !== "cluster") {
    return null;
  }
  return clustersById.get(selection.clusterId) ?? null;
};

const entrypointsOrEmpty = (
  template: CatalogTemplate | null
): CatalogTemplate["entrypoints"] => template?.entrypoints ?? [];

const operationsOrEmpty = (
  template: CatalogTemplate | null
): CatalogOperation[] => template?.operations ?? [];

// Pulled out of ClustersPage (own complexity budget, same reasoning as
// useSelectedWorkloadCatalog/findTemplateFor above) — a self-contained
// Dialog host so ClustersPage's own render only needs to pass data down,
// not branch on it directly.
const WorkloadRedeployDialogHost = ({
  onClose,
  onRedeploy,
  template,
  workload,
}: {
  onClose: () => void;
  onRedeploy: (values: Record<string, unknown>) => Promise<unknown>;
  template: CatalogTemplate | null;
  workload: ClusterWorkloadRow | null;
}) => {
  const isOpen = Boolean(workload && template);
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      purpose="form"
      width={480}
    >
      {isOpen && workload && template ? (
        <Layout
          content={
            <LayoutContent>
              <WorkloadRedeployDialog
                config={workload.config}
                key={workload._id}
                onClose={onClose}
                onRedeploy={onRedeploy}
                template={template}
              />
            </LayoutContent>
          }
          header={
            <DialogHeader
              onOpenChange={onClose}
              title={m.admin_workload_redeploy_title({
                name: workload.displayName,
              })}
            />
          }
        />
      ) : null}
    </Dialog>
  );
};

const WorkloadOperationDialogHost = ({
  onClose,
  onRun,
  selection,
}: {
  onClose: () => void;
  onRun: (values: Record<string, unknown>) => Promise<OperationResult>;
  selection: {
    operation: CatalogOperation;
    workload: ClusterWorkloadRow;
  } | null;
}) => (
  <Dialog
    isOpen={Boolean(selection)}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="form"
    width={480}
  >
    {selection ? (
      <Layout
        content={
          <LayoutContent>
            <WorkloadOperationDialog
              key={`${selection.workload._id}:${selection.operation.key}`}
              onClose={onClose}
              onRun={onRun}
              operation={selection.operation}
            />
          </LayoutContent>
        }
        header={
          <DialogHeader
            onOpenChange={onClose}
            subtitle={selection.operation.description}
            title={selection.operation.label}
          />
        }
      />
    ) : null}
  </Dialog>
);

// Pulled out of ClustersPage (own complexity budget, same reasoning as the
// dialog hosts above) — the ResizeHandle + which-panel-to-show branch,
// gated by the caller (see the `Boolean(selectedWorkloadRow ||
// selectedCluster) &&` at the call site) so Layout's `end` slot gets a
// real falsy value, not an element that merely renders null, when nothing
// is selected.
const ClustersPageDetailPanel = ({
  detailPanelProps,
  onClose,
  onDeleteCluster,
  onDestroyWorkload,
  onEditCluster,
  onOpenWorkload,
  onRedeployWorkload,
  onRerollCluster,
  onResumeWorkload,
  onRunWorkloadOperation,
  onStopWorkload,
  selectedCluster,
  selectedWorkloadRow,
  selectedWorkloadTemplate,
  selectionKind,
}: {
  detailPanelProps: ResizableProps;
  onClose: () => void;
  onDeleteCluster: (cluster: ClusterSummary) => void;
  onDestroyWorkload: (workload: ClusterWorkloadRow) => void;
  onEditCluster: (cluster: ClusterSummary) => void;
  onOpenWorkload: (
    workload: ClusterWorkloadRow,
    entrypointName: string
  ) => void;
  onRedeployWorkload: (workload: ClusterWorkloadRow) => void;
  onRerollCluster: (cluster: ClusterSummary) => void;
  onResumeWorkload: (workload: ClusterWorkloadRow) => void;
  onRunWorkloadOperation: (
    workload: ClusterWorkloadRow,
    operation: CatalogOperation
  ) => void;
  onStopWorkload: (workload: ClusterWorkloadRow) => void;
  selectedCluster: ClusterSummary | null;
  selectedWorkloadRow: ClusterWorkloadRow | null;
  selectedWorkloadTemplate: CatalogTemplate | null;
  selectionKind: "workload" | "cluster" | null;
}) => (
  <>
    <ResizeHandle
      isAlwaysVisible={false}
      isReversed
      resizable={detailPanelProps}
    />
    {selectionKind === "workload" ? (
      <WorkloadDetailPanel
        entrypoints={entrypointsOrEmpty(selectedWorkloadTemplate)}
        onClose={onClose}
        onDestroy={onDestroyWorkload}
        onOpen={onOpenWorkload}
        onRedeploy={onRedeployWorkload}
        onResume={onResumeWorkload}
        onRunOperation={onRunWorkloadOperation}
        onStop={onStopWorkload}
        operations={operationsOrEmpty(selectedWorkloadTemplate)}
        resizable={detailPanelProps}
        workload={selectedWorkloadRow}
      />
    ) : (
      <ClusterDetailPanel
        cluster={selectedCluster}
        onClose={onClose}
        onDelete={onDeleteCluster}
        onEdit={onEditCluster}
        onReroll={onRerollCluster}
        resizable={detailPanelProps}
      />
    )}
  </>
);

const routeApi = getRouteApi("/_authed/admin/clusters");

export const ClustersPage = () => {
  const { clusterId, modal } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const fleet = useQuery(api.operators.queries.listClusters);
  const clusters = fleet?.clusters;
  const unclaimedWorkloads = fleet?.unclaimedWorkloads ?? EMPTY_WORKLOADS;
  const createCluster = useMutation(api.operators.mutations.createCluster);
  const updateCluster = useMutation(api.operators.mutations.updateCluster);
  const rerollEnrollmentToken = useMutation(
    api.operators.mutations.rerollEnrollmentToken
  );
  const deleteCluster = useMutation(api.operators.mutations.deleteCluster);
  const adminRequestStop = useMutation(
    api.workloads.mutations.adminRequestStop
  );
  const adminRequestResume = useMutation(
    api.workloads.mutations.adminRequestResume
  );
  const adminRequestDestroy = useMutation(
    api.workloads.mutations.adminRequestDestroy
  );
  const adminGetCatalog = useAction(api.workloads.actions.adminGetCatalog);
  const adminRequestRedeploy = useAction(
    api.workloads.actions.adminRequestRedeploy
  );
  const adminRunOperation = useAction(api.workloads.actions.adminRunOperation);
  const adminGetWorkloadAccessToken = useMutation(
    api.workloads.mutations.adminGetWorkloadAccessToken
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

  // Intentionally NOT URL-driven — shows a cluster enrollment token (a
  // secret); it doesn't belong in a URL that survives in browser
  // history/logs.
  const [revealedToken, setRevealedToken] = useState<{
    clusterName: string;
    token: string;
  } | null>(null);
  const isNewWorkloadOpen = modal === "new-workload";
  const rerollAlert = useImperativeAlertDialog();
  const deleteAlert = useImperativeAlertDialog();
  const destroyWorkloadAlert = useImperativeAlertDialog();
  const toast = useToast();

  const [activeOperation, setActiveOperation] = useState<{
    operation: CatalogOperation;
    workload: ClusterWorkloadRow;
  } | null>(null);
  const [activeRedeploy, setActiveRedeploy] =
    useState<ClusterWorkloadRow | null>(null);

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
      // vanishing from this page (see operators/queries.ts#listClusters).
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

  // Pure derivation from the URL + the already-loaded clusters query — safe
  // to URL-drive because a cluster's data lives in the always-loaded
  // listClusters query, unlike the operation/redeploy dialogs (see
  // routes/_authed/admin/clusters.tsx's doc comment on why those stay
  // local). `undefined` clusters (still loading) and an unknown clusterId
  // (stale/deleted elsewhere) both resolve to "nothing to show".
  const clusterSeed = useMemo(() => {
    if (modal === "create") {
      return {
        initialState: EMPTY_CLUSTER_FORM,
        mode: { kind: "create" as const },
      };
    }
    if (modal === "edit" && clusterId && clusters) {
      const cluster = clustersById.get(clusterId as Id<"operators">);
      return cluster
        ? {
            initialState: {
              description: cluster.description ?? "",
              name: cluster.name,
              region: cluster.region ?? "",
              retentionPolicy: cluster.retentionPolicy,
              tags: cluster.tags,
            },
            mode: {
              kind: "edit" as const,
              operatorId: cluster._id,
              tagsSetByOperator: cluster.tagsSetByOperator,
            },
          }
        : null;
    }
    return null;
  }, [modal, clusterId, clusters, clustersById]);

  // Re-derived from the live rows/clustersById on every render (see
  // DetailSelection's doc comment) instead of read off stored state — the
  // detail panel always reflects whatever the reactive query currently
  // says, no stale snapshot from click-time.
  const selectedWorkloadRow = workloadById(detailSelection, rows);
  const selectedCluster = clusterFromSelection(detailSelection, clustersById);
  const workloadCatalog = useSelectedWorkloadCatalog(
    selectedWorkloadRow?._id,
    selectedWorkloadRow?.status,
    adminGetCatalog
  );
  const selectedWorkloadTemplate = findTemplateFor(
    selectedWorkloadRow,
    workloadCatalog
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
      return [...byUser.entries()]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([userEmail, userRows]) => ({
          key: userEmail,
          label: userEmail,
          rows: userRows,
        }));
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
    navigate({
      search: (prev) => ({ ...prev, clusterId: undefined, modal: "create" }),
    });
  };

  const openEditDialog = (cluster: ClusterSummary) => {
    navigate({
      search: (prev) => ({ ...prev, clusterId: cluster._id, modal: "edit" }),
    });
  };

  const closeClusterPageModal = () => {
    navigate({
      replace: true,
      search: (prev) => {
        const { clusterId: _clusterId, modal: _modal, ...rest } = prev;
        return rest;
      },
    });
  };

  const handleClusterFormSubmit = async (state: ClusterFormState) => {
    if (!clusterSeed) {
      return;
    }
    if (clusterSeed.mode.kind === "create") {
      const { enrollmentToken } = await createCluster({
        description: state.description || undefined,
        name: state.name,
        region: state.region || undefined,
        retentionPolicy: state.retentionPolicy,
        tags: state.tags,
      });
      setRevealedToken({ clusterName: state.name, token: enrollmentToken });
    } else {
      await updateCluster({
        description: state.description || undefined,
        name: state.name,
        operatorId: clusterSeed.mode.operatorId,
        region: state.region || undefined,
        retentionPolicy: state.retentionPolicy,
        tags: state.tags,
      });
    }
    // Clears the URL too, not just this render — otherwise a reload after a
    // successful save reopens the dialog from the now-stale
    // ?modal=edit&clusterId= still sitting in the address bar.
    closeClusterPageModal();
  };

  const confirmReroll = (cluster: ClusterSummary) => {
    const baseOptions = {
      actionLabel: m.admin_clusters_reroll_confirm_action(),
      description: m.admin_clusters_reroll_confirm_description({
        name: cluster.name,
      }),
      title: m.admin_clusters_reroll_confirm_title(),
    };
    const onAction = async () => {
      // Disables the action button for the duration of the request —
      // without this, a fast double-click fires onAction twice before the
      // first request resolves.
      rerollAlert.show({ ...baseOptions, isActionLoading: true, onAction });
      try {
        const { enrollmentToken } = await rerollEnrollmentToken({
          operatorId: cluster._id,
        });
        rerollAlert.hide();
        setRevealedToken({
          clusterName: cluster.name,
          token: enrollmentToken,
        });
      } catch (error) {
        // No success toast needed: the revealed-token dialog above is
        // itself the success feedback. Left open on error (not hidden) so
        // the toast is visible against the dialog, same as
        // admin-files/admin-groups' delete confirms. Re-enables the action
        // button for a retry.
        rerollAlert.show({ ...baseOptions, isActionLoading: false, onAction });
        toast({
          body: m.toast_cluster_reroll_error({
            error: getErrorMessage(error),
          }),
          type: "error",
        });
      }
    };
    rerollAlert.show({ ...baseOptions, onAction });
  };

  const confirmDelete = (cluster: ClusterSummary) => {
    const baseOptions = {
      actionLabel: m.admin_clusters_delete_confirm_action(),
      description: m.admin_clusters_delete_confirm_description({
        name: cluster.name,
      }),
      title: m.admin_clusters_delete_confirm_title(),
    };
    const onAction = async () => {
      // Disables the action button for the duration of the request —
      // without this, a fast double-click fires onAction twice before the
      // first request resolves.
      deleteAlert.show({ ...baseOptions, isActionLoading: true, onAction });
      try {
        await deleteCluster({ operatorId: cluster._id });
        deleteAlert.hide();
        toast({ body: m.toast_cluster_delete_success() });
      } catch (error) {
        deleteAlert.show({ ...baseOptions, isActionLoading: false, onAction });
        toast({
          body: m.admin_clusters_error({ error: getErrorMessage(error) }),
          type: "error",
        });
      }
    };
    deleteAlert.show({ ...baseOptions, onAction });
  };

  // No confirm dialog for stop/resume — reversible, unlike destroy, so
  // there's nothing here that "cannot be undone" (mirrors src/pages/
  // workloads/ui/workloads-page.tsx's handleStop/handleResume).
  const handleStopWorkload = async (workload: ClusterWorkloadRow) => {
    try {
      await adminRequestStop({ workloadId: workload._id });
      toast({ body: m.toast_workload_stop_success() });
    } catch (error) {
      toast({
        body: m.toast_workload_stop_error({ error: getErrorMessage(error) }),
        type: "error",
      });
    }
  };

  const handleResumeWorkload = async (workload: ClusterWorkloadRow) => {
    try {
      await adminRequestResume({ workloadId: workload._id });
      toast({ body: m.toast_workload_resume_success() });
    } catch (error) {
      toast({
        body: m.toast_workload_resume_error({ error: getErrorMessage(error) }),
        type: "error",
      });
    }
  };

  const confirmDestroyWorkload = (workload: ClusterWorkloadRow) => {
    const isDismiss = workload.status === "failed";
    const baseOptions = {
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
      title: isDismiss
        ? m.admin_workload_dismiss_confirm_title()
        : m.admin_workload_destroy_confirm_title(),
    };
    const onAction = async () => {
      // Disables the action button for the duration of the request —
      // without this, a fast double-click fires onAction twice before the
      // first request resolves: the first transitions the workload to
      // requested_destroy and succeeds, the second then hits that same
      // row already in requested_destroy and fails (applyDestroy's status
      // guard only allows active/stopped/failed) — the two-toast bug.
      destroyWorkloadAlert.show({
        ...baseOptions,
        isActionLoading: true,
        onAction,
      });
      try {
        await adminRequestDestroy({ workloadId: workload._id });
        destroyWorkloadAlert.hide();
        toast({ body: m.toast_workload_destroy_success() });
      } catch (error) {
        // Left open on error (not hidden), same as admin-files/
        // admin-groups' delete confirms — the toast is otherwise shown
        // against a dialog that already closed. Re-enables the action
        // button for a retry.
        destroyWorkloadAlert.show({
          ...baseOptions,
          isActionLoading: false,
          onAction,
        });
        toast({
          body: m.toast_workload_destroy_error({
            error: getErrorMessage(error),
          }),
          type: "error",
        });
      }
    };
    destroyWorkloadAlert.show({ ...baseOptions, onAction });
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

  // entrypoint is a mandatory path segment; the gateway auth token/cookie
  // exchange is unaffected by acting as an admin (see convex/workloads/
  // mutations.ts#adminGetWorkloadAccessToken's doc comment).
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

  const redeployTemplate = findTemplateFor(activeRedeploy, workloadCatalog);

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
        const { clusterId: rowClusterId } = row;
        if (!rowClusterId) {
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
              setDetailSelection({ clusterId: rowClusterId, kind: "cluster" });
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
  }, [groupBy, setDetailSelection]);

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
            setDetailSelection({ kind: "workload", workloadId: item._id }),
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
      <Center axis="both" minHeight="100%">
        <Text type="supporting">{m.admin_clusters_loading()}</Text>
      </Center>
    );
  }

  let tableRegion: ReactNode;
  if (isEmpty) {
    tableRegion = (
      <Center axis="both" minHeight={240}>
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
                      setDetailSelection({
                        kind: "workload",
                        workloadId: row._id,
                      })
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
                          setDetailSelection({
                            clusterId: cluster._id,
                            kind: "cluster",
                          });
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
                              setDetailSelection({
                                clusterId: cluster._id,
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
        })}
      </Table>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Layout
        content={
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
          <LayoutContent padding={0} role="main">
            {tableRegion}
          </LayoutContent>
        }
        end={
          Boolean(selectedWorkloadRow || selectedCluster) && (
            <ClustersPageDetailPanel
              detailPanelProps={detailPanel.props}
              onClose={() => setDetailSelection(null)}
              onDeleteCluster={confirmDelete}
              onDestroyWorkload={confirmDestroyWorkload}
              onEditCluster={openEditDialog}
              onOpenWorkload={handleOpenWorkload}
              onRedeployWorkload={openWorkloadRedeployDialog}
              onRerollCluster={confirmReroll}
              onResumeWorkload={handleResumeWorkload}
              onRunWorkloadOperation={openWorkloadOperationDialog}
              onStopWorkload={handleStopWorkload}
              selectedCluster={selectedCluster}
              selectedWorkloadRow={selectedWorkloadRow}
              selectedWorkloadTemplate={selectedWorkloadTemplate}
              selectionKind={detailSelection?.kind ?? null}
            />
          )
        }
        header={
          <>
            <LayoutHeader padding={4}>
              <HStack gap={3} vAlign="center">
                <StackItem size="fill">
                  <VStack gap={2}>
                    <Heading level={1}>{m.nav_fleet()}</Heading>
                    <Text color="secondary">
                      {m.admin_clusters_page_subtitle()}
                    </Text>
                  </VStack>
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
                      label: m.admin_clusters_add_workload(),
                      onClick: () =>
                        navigate({
                          search: (prev) => ({
                            ...prev,
                            modal: "new-workload",
                          }),
                        }),
                    },
                  ]}
                />
              </HStack>
            </LayoutHeader>
            {/* Renders nothing until a "system-fleet" alert exists — see SystemAlertBanners' doc comment. */}
            <SystemAlertBanners topic="system-fleet" />
            <Toolbar
              dividers={["bottom"]}
              label={m.nav_fleet()}
              startContent={
                <HStack gap={2} vAlign="center" width="100%" wrap="wrap">
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
              }
            />
          </>
        }
        height="fill"
      />

      <NewWorkloadDialog
        isOpen={isNewWorkloadOpen}
        onClose={closeClusterPageModal}
      />
      <ClusterFormDialog
        initialState={clusterSeed?.initialState ?? null}
        mode={clusterSeed?.mode ?? null}
        onClose={closeClusterPageModal}
        onSubmit={handleClusterFormSubmit}
      />
      <TokenRevealDialog
        onClose={() => setRevealedToken(null)}
        revealed={revealedToken}
      />
      <WorkloadRedeployDialogHost
        onClose={closeWorkloadRedeployDialog}
        onRedeploy={(values) => {
          if (!activeRedeploy) {
            return Promise.reject(new Error("No workload selected"));
          }
          return adminRequestRedeploy({
            params: values,
            workloadId: activeRedeploy._id,
          });
        }}
        template={redeployTemplate}
        workload={activeRedeploy}
      />
      <WorkloadOperationDialogHost
        onClose={closeWorkloadOperationDialog}
        onRun={(values) => {
          if (!activeOperation) {
            return Promise.reject(new Error("No operation selected"));
          }
          return adminRunOperation({
            operationKey: activeOperation.operation.key,
            params: values,
            workloadId: activeOperation.workload._id,
          });
        }}
        selection={activeOperation}
      />
      {rerollAlert.element}
      {deleteAlert.element}
      {destroyWorkloadAlert.element}
    </Section>
  );
};

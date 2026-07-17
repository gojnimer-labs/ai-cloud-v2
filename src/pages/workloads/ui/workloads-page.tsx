import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Tokenizer } from "@astryxdesign/core/Tokenizer";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowPathIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useAction, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import type {
  CatalogOperation,
  CatalogTemplate,
  Entrypoint,
} from "@/entities/catalog-parameter";

import type {
  OperatorHealthStatus,
  WorkloadLivePhase,
  WorkloadRow,
} from "../model/types";
import { DeployWorkloadForm } from "./deploy-workload-form";
import { OperationDialog } from "./operation-dialog";
import { RedeployDialog } from "./redeploy-dialog";
import { StatusCell } from "./status-cell";

const WORKLOAD_POLL_INTERVAL_MS = 4000;

// No fixed vocabulary for operator tags — same free-form hasCreate pattern as
// admin-clusters/ui/cluster-form-dialog.tsx's cluster-tags Tokenizer.
const TAG_SEARCH_SOURCE = { bootstrap: () => [], search: () => [] };

const NAME_ADJECTIVES = [
  "clever",
  "brisk",
  "quiet",
  "bold",
  "lucky",
  "calm",
  "swift",
  "bright",
];
const NAME_ANIMALS = [
  "fox",
  "otter",
  "lynx",
  "heron",
  "wren",
  "panda",
  "falcon",
  "seal",
];

// A friendly placeholder shown in the display-name field, never sent as a real
// value unless the user actually types it — requestCreate already generates its
// own fallback (`${templateId}-${randomSuffix}`) server-side when displayName is
// omitted entirely, so this is purely a nicer suggestion, not a required input.
const suggestDisplayName = (): string => {
  const adjective =
    NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const animal = NAME_ANIMALS[Math.floor(Math.random() * NAME_ANIMALS.length)];
  const suffix = Math.floor(Math.random() * 90 + 10);
  return `${adjective}-${animal}-${suffix}`;
};

const HEALTH_STATUS_LABEL: Record<OperatorHealthStatus, string> = {
  healthy: "healthy",
  offline: "offline",
  ready_to_destroy: "ready to destroy",
};

const HEALTH_STATUS_VARIANT: Record<
  OperatorHealthStatus,
  "success" | "warning" | "error"
> = {
  healthy: "success",
  offline: "warning",
  ready_to_destroy: "error",
};

// requestDestroy (see convex/workloads/mutations.ts) accepts an `active` or
// `stopped` row (-> requested_destroy, claimed and torn down by the owning
// operator), or a `failed` row with no `name` (a create attempt that never
// produced a CR — dismissed via a direct soft-delete, nothing for an
// operator to tear down). Every other status either has an operation
// already in flight against it or has no live CR to destroy in the first
// place.
const canRemove = (row: WorkloadRow): boolean =>
  row.status === "active" ||
  row.status === "stopped" ||
  row.status === "failed";

export const WorkloadsPage = () => {
  const operators = useQuery(api.operators.queries.list);
  const getCatalog = useAction(api.operators.actions.getCatalog);
  const requestWorkload = useAction(api.workloads.actions.requestWorkload);
  const listMyWorkloads = useAction(api.workloads.actions.listMyWorkloads);
  const getWorkloadAccessToken = useAction(
    api.workloads.actions.getWorkloadAccessToken
  );
  const requestRemoval = useAction(api.workloads.actions.requestRemoval);
  const requestRedeployAction = useAction(
    api.workloads.actions.requestRedeployAction
  );
  const requestStopAction = useAction(api.workloads.actions.requestStopAction);
  const requestResumeAction = useAction(
    api.workloads.actions.requestResumeAction
  );
  const runOperation = useAction(api.workloads.actions.runOperation);
  const removeAlert = useImperativeAlertDialog();

  // Reactive: reflects the `workloads` table (including `status`) the instant a
  // request/claim/upsert/destroy mutation lands (see convex/workloads/
  // queries.ts#listOwned) — this is what lets a `requested` row appear the
  // moment requestWorkload commits, with no optimistic placeholder needed.
  const ownedRows = useQuery(api.workloads.queries.listOwned);
  const [statusById, setStatusById] = useState<
    Record<string, WorkloadLivePhase>
  >({});

  // There's no public tags-scoped catalog lookup (Part A shipped
  // getRepresentativeForTags as internal-only, and operators.queries.list
  // doesn't expose tags) — the deploy form's template/parameter schema is
  // sourced from any one reachable healthy operator purely for rendering the
  // form. This is never sent anywhere: requestWorkload takes desiredOperatorTags,
  // not an operatorId, and the actual claiming operator is resolved server-side
  // (and re-validated there, including a templateVersion compatibility check),
  // so a schema mismatch with whichever operator eventually claims the request
  // fails fast at claim time rather than silently deploying the wrong shape.
  const formOperatorId = useMemo(() => {
    const healthy = (operators ?? []).find(
      (operator) => operator.healthStatus === "healthy"
    );
    return healthy?._id ?? null;
  }, [operators]);
  const [catalog, setCatalog] = useState<CatalogTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [desiredOperatorTags, setDesiredOperatorTags] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [displayNameSuggestion, setDisplayNameSuggestion] =
    useState(suggestDisplayName);
  const [isDeploying, setIsDeploying] = useState(false);

  // Per-operator catalogs for rows in the workloads table — a row's own operator
  // isn't necessarily formOperatorId above, so each unique operatorId among the
  // current rows gets its own fetch. Used for the row-level operations/
  // entrypoints menu, and to source the template for the redeploy dialog below.
  const [catalogsByOperator, setCatalogsByOperator] = useState<
    Record<string, CatalogTemplate[]>
  >({});
  const [activeOperation, setActiveOperation] = useState<{
    operation: CatalogOperation;
    row: WorkloadRow;
  } | null>(null);
  const [activeRedeploy, setActiveRedeploy] = useState<WorkloadRow | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const rows = await listMyWorkloads({});
        if (!cancelled) {
          setStatusById(
            Object.fromEntries(
              rows.map((row) => [
                row._id,
                { phase: row.phase, readyReplicas: row.readyReplicas },
              ])
            )
          );
        }
      } catch {
        // Keep showing the last known status on a transient polling failure.
      }
    };

    poll();
    // listMyWorkloads is an action (it fetches live status from the operator,
    // which Convex has no way to subscribe to), so this part still has to be
    // polled — only which rows exist, and their request-lifecycle status, is
    // reactive now (via ownedRows above).
    const id = setInterval(poll, WORKLOAD_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [listMyWorkloads]);

  useEffect(() => {
    // No reset-to-null when there's no healthy operator to source a catalog
    // from: the Template selector and everything derived from `catalog`/
    // `templateId` only ever renders inside the `catalog ?`/`selectedTemplate`
    // guards below, so a stale value here is never actually displayed —
    // resetting it via setState would just be an extra synchronous render for
    // no observable effect (same reasoning the removed operator-Selector effect
    // used to apply to its own now-deleted `operatorId` state).
    if (!formOperatorId) {
      return;
    }
    let cancelled = false;
    const fetchCatalog = async () => {
      const templates = await getCatalog({ operatorId: formOperatorId });
      if (!cancelled) {
        setCatalog(templates);
        setTemplateId(null);
      }
    };
    fetchCatalog();
    return () => {
      cancelled = true;
    };
  }, [formOperatorId, getCatalog]);

  useEffect(() => {
    const missingOperatorIds = [
      ...new Set(
        (ownedRows ?? [])
          .map((row) => row.operatorId)
          .filter((id): id is Id<"operators"> => Boolean(id))
      ),
    ].filter((id) => !(id in catalogsByOperator));
    if (missingOperatorIds.length === 0) {
      return;
    }
    let cancelled = false;
    const fetchMissingCatalogs = async () => {
      const entries = await Promise.all(
        missingOperatorIds.map(
          async (id) => [id, await getCatalog({ operatorId: id })] as const
        )
      );
      if (cancelled) {
        return;
      }
      setCatalogsByOperator((prev) => {
        const next = { ...prev };
        for (const [id, templates] of entries) {
          next[id] = templates;
        }
        return next;
      });
    };
    fetchMissingCatalogs();
    return () => {
      cancelled = true;
    };
  }, [ownedRows, catalogsByOperator, getCatalog]);

  // Row actions (open/operations/redeploy) only ever apply to an `active` row —
  // anything else has no live CR (or, for requested_destroy/destroying, one
  // that's on its way out) to open or run a function against.
  const operationsFor = (row: WorkloadRow): CatalogOperation[] => {
    if (row.status !== "active" || !row.operatorId) {
      return [];
    }
    const template = catalogsByOperator[row.operatorId]?.find(
      (t) => t.id === row.templateId
    );
    return template?.operations ?? [];
  };

  const entrypointsFor = (row: WorkloadRow): Entrypoint[] => {
    if (row.status !== "active" || !row.operatorId) {
      return [];
    }
    const template = catalogsByOperator[row.operatorId]?.find(
      (t) => t.id === row.templateId
    );
    return template?.entrypoints ?? [];
  };

  const selectedTemplate = catalog?.find((t) => t.id === templateId) ?? null;

  // Distinguishes "still loading" from "genuinely nothing to deploy to" —
  // without this, a fleet with no healthy operator at all would show "Loading
  // catalog…" forever instead of telling the user why the Template selector
  // stays empty.
  const templatePlaceholder = (): string => {
    if (operators === undefined) {
      return "Loading operators…";
    }
    if (!formOperatorId) {
      return "No healthy operators available";
    }
    return catalog ? "Choose a template" : "Loading catalog…";
  };

  const handleSelectTemplate = (id: string) => {
    setTemplateId(id);
  };

  const handleDeploy = async (values: Record<string, unknown>) => {
    if (!templateId) {
      return;
    }
    setIsDeploying(true);
    try {
      await requestWorkload({
        desiredOperatorTags,
        displayName: displayName.trim() || undefined,
        params: values,
        templateId,
      });
      // Reset for the next deploy — the requested row is already visible via
      // the reactive ownedRows query, no optimistic placeholder to roll back.
      setTemplateId(null);
      setDesiredOperatorTags([]);
      setDisplayName("");
      setDisplayNameSuggestion(suggestDisplayName());
    } finally {
      setIsDeploying(false);
    }
  };

  const removeWorkload = async (workloadId: Id<"workloads">) => {
    try {
      await requestRemoval({ workloadId });
    } finally {
      // Always closes, even on rejection (network blip, or the
      // should-never-happen "failed with a name" throw in requestDestroy) —
      // otherwise the dialog stays open with no feedback, since onAction
      // doesn't auto-close it.
      removeAlert.hide();
    }
  };

  const handleRemove = (row: WorkloadRow) => {
    const isDismiss = row.status === "failed";
    removeAlert.show({
      actionLabel: isDismiss ? "Dismiss" : "Remove",
      description: isDismiss
        ? `Dismiss the failed workload "${row.displayName}"? This cannot be undone.`
        : `Remove workload "${row.displayName}"? This cannot be undone.`,
      onAction: () => removeWorkload(row._id),
      title: isDismiss ? "Dismiss workload?" : "Remove workload?",
    });
  };

  // No confirm dialog, unlike remove/destroy — pausing/resuming is fully
  // reversible (unlike destroy, there's nothing here that "cannot be
  // undone").
  const handleStop = (workloadId: Id<"workloads">) => {
    void requestStopAction({ workloadId });
  };

  const handleResume = (workloadId: Id<"workloads">) => {
    void requestResumeAction({ workloadId });
  };

  // entrypoint is a mandatory path segment for every workload; namespace is gone
  // from this URL entirely — the operator deploys into a namespace fixed per
  // operator instance now, so it's no longer part of workload identity. The
  // gateway auth cookie/token exchange itself is unaffected, only the URL this
  // builds.
  const handleOpen = async (
    workloadId: Id<"workloads">,
    entrypoint: string
  ) => {
    const { externalUrl, name, token } = await getWorkloadAccessToken({
      workloadId,
    });
    window.open(
      `${externalUrl}/gw/${name}/${entrypoint}/?token=${encodeURIComponent(token)}`,
      "_blank"
    );
  };

  const openOperationDialog = (
    row: WorkloadRow,
    operation: CatalogOperation
  ) => {
    setActiveOperation({ operation, row });
  };

  const closeOperationDialog = () => {
    setActiveOperation(null);
  };

  const openRedeployDialog = (row: WorkloadRow) => {
    setActiveRedeploy(row);
  };

  const closeRedeployDialog = () => {
    setActiveRedeploy(null);
  };

  const redeployOperatorId = activeRedeploy?.operatorId;
  const redeployTemplate: CatalogTemplate | null = redeployOperatorId
    ? (catalogsByOperator[redeployOperatorId]?.find(
        (t) => t.id === activeRedeploy?.templateId
      ) ?? null)
    : null;

  const workloads: WorkloadRow[] = ownedRows ?? [];

  const columns: TableColumn<WorkloadRow>[] = [
    {
      header: "Name",
      key: "displayName",
      renderCell: (row) => {
        const label = (
          <Text type="body" weight="semibold">
            {row.displayName}
          </Text>
        );
        // The real Kubernetes resource name is an internal/support-facing
        // detail now (see convex/schema.ts's displayName/name doc comment) —
        // surfaced on hover rather than as a visible column, and only once a
        // create-time upsert has actually assigned one.
        return row.name ? (
          <Tooltip content={`Kubernetes name: ${row.name}`}>{label}</Tooltip>
        ) : (
          label
        );
      },
    },
    {
      header: "Namespace",
      key: "namespace",
      renderCell: (row) => (
        <Text color="secondary">{row.namespace ?? "—"}</Text>
      ),
    },
    {
      header: "Template",
      key: "templateId",
      renderCell: (row) => <Text color="secondary">{row.templateId}</Text>,
    },
    {
      header: "Status",
      key: "status",
      renderCell: (row) => (
        <StatusCell livePhase={statusById[row._id]} row={row} />
      ),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (row) => {
        const entrypoints = entrypointsFor(row);
        const menuItems = [
          ...(row.status === "active"
            ? [
                {
                  icon: ArrowPathIcon,
                  label: "Redeploy",
                  onClick: () => openRedeployDialog(row),
                },
                {
                  icon: PauseIcon,
                  label: "Pause",
                  onClick: () => handleStop(row._id),
                },
              ]
            : []),
          ...(row.status === "stopped"
            ? [
                {
                  icon: PlayIcon,
                  label: "Resume",
                  onClick: () => handleResume(row._id),
                },
              ]
            : []),
          ...(canRemove(row)
            ? [
                {
                  icon: TrashIcon,
                  label: row.status === "failed" ? "Dismiss" : "Remove",
                  onClick: () => handleRemove(row),
                },
              ]
            : []),
        ];
        return (
          <HStack gap={2}>
            {entrypoints.map((entrypoint) => (
              <Button
                key={entrypoint.name}
                label={entrypoints.length > 1 ? entrypoint.label : "Open"}
                onClick={() => handleOpen(row._id, entrypoint.name)}
                size="sm"
                variant="secondary"
              />
            ))}
            {operationsFor(row).map((operation) => (
              <Button
                key={operation.key}
                label={operation.label}
                onClick={() => openOperationDialog(row, operation)}
                size="sm"
                variant="secondary"
              />
            ))}
            {menuItems.length > 0 ? (
              <MoreMenu items={menuItems} label="Workload actions" />
            ) : null}
          </HStack>
        );
      },
    },
  ];

  return (
    <Section padding={6} variant="transparent">
      {removeAlert.element}
      <Dialog
        isOpen={Boolean(activeOperation)}
        onOpenChange={(open) => {
          if (!open) {
            closeOperationDialog();
          }
        }}
        purpose="form"
        width={480}
      >
        {activeOperation ? (
          <Layout
            content={
              <LayoutContent>
                <OperationDialog
                  key={`${activeOperation.row._id}:${activeOperation.operation.key}`}
                  onClose={closeOperationDialog}
                  onRun={(values) =>
                    runOperation({
                      operationKey: activeOperation.operation.key,
                      params: values,
                      workloadId: activeOperation.row._id,
                    })
                  }
                  operation={activeOperation.operation}
                />
              </LayoutContent>
            }
            header={
              <DialogHeader
                onOpenChange={closeOperationDialog}
                subtitle={activeOperation.operation.description}
                title={activeOperation.operation.label}
              />
            }
          />
        ) : null}
      </Dialog>
      <Dialog
        isOpen={Boolean(activeRedeploy)}
        onOpenChange={(open) => {
          if (!open) {
            closeRedeployDialog();
          }
        }}
        purpose="form"
        width={480}
      >
        {activeRedeploy && redeployTemplate ? (
          <Layout
            content={
              <LayoutContent>
                <RedeployDialog
                  config={
                    activeRedeploy.config as Record<string, unknown> | undefined
                  }
                  key={activeRedeploy._id}
                  onClose={closeRedeployDialog}
                  onRedeploy={(values) =>
                    requestRedeployAction({
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
                onOpenChange={closeRedeployDialog}
                title={`Redeploy ${activeRedeploy.displayName}`}
              />
            }
          />
        ) : null}
      </Dialog>
      <VStack gap={6}>
        <VStack gap={2}>
          <Heading level={1}>Workloads</Heading>
          <Text color="secondary">
            Operators register with Convex and heartbeat on an interval;
            workloads deploy through them from a catalog they publish, and are
            opened via a permission-checked gateway route.
          </Text>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Operators</Heading>
          <List density="compact" hasDividers>
            {(operators ?? []).map((operator) => (
              <ListItem
                description={
                  <Text color="secondary" type="supporting">
                    Last heartbeat:{" "}
                    {operator.lastHeartbeatAt ? (
                      <Timestamp
                        format="relative"
                        value={new Date(operator.lastHeartbeatAt).toISOString()}
                      />
                    ) : (
                      "never"
                    )}
                  </Text>
                }
                endContent={
                  <StatusDot
                    isPulsing={operator.healthStatus === "healthy"}
                    label={HEALTH_STATUS_LABEL[operator.healthStatus]}
                    variant={HEALTH_STATUS_VARIANT[operator.healthStatus]}
                  />
                }
                key={operator._id}
                label={operator.name}
              />
            ))}
          </List>
        </VStack>

        <Section>
          <VStack gap={4}>
            <Heading level={2}>Deploy a workload</Heading>
            <Tokenizer
              hasCreate
              label="Operator tags"
              onChange={(items) =>
                setDesiredOperatorTags(items.map((item) => item.label))
              }
              placeholder="Match operators by tag (leave empty to match any)"
              searchSource={TAG_SEARCH_SOURCE}
              value={desiredOperatorTags.map((tag) => ({
                id: tag,
                label: tag,
              }))}
            />
            <TextInput
              label="Name"
              onChange={setDisplayName}
              placeholder={displayNameSuggestion}
              value={displayName}
            />
            <Selector
              hasClear
              isDisabled={!catalog}
              label="Template"
              onChange={(v) => v && handleSelectTemplate(v)}
              options={(catalog ?? []).map((t) => ({
                label: `${t.icon} ${t.name}`,
                value: t.id,
              }))}
              placeholder={templatePlaceholder()}
              value={templateId ?? ""}
            />

            {selectedTemplate ? (
              <VStack gap={3}>
                <Text color="secondary">{selectedTemplate.description}</Text>
                <DeployWorkloadForm
                  isDeploying={isDeploying}
                  key={selectedTemplate.id}
                  onDeploy={handleDeploy}
                  template={selectedTemplate}
                />
              </VStack>
            ) : null}
          </VStack>
        </Section>

        <VStack gap={2}>
          <Heading level={2}>Your workloads</Heading>
          <Table<WorkloadRow>
            columns={columns}
            data={workloads}
            hasHover
            idKey="_id"
          />
        </VStack>
      </VStack>
    </Section>
  );
};

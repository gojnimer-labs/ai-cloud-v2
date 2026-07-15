import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";

import type {
  CatalogOperation,
  CatalogTemplate,
  Entrypoint,
} from "@/entities/catalog-parameter";

import { formatRelativeTime } from "../model/format";
import type { OperatorHealthStatus, WorkloadRow } from "../model/types";
import { DeployWorkloadForm } from "./deploy-workload-form";
import { OperationDialog } from "./operation-dialog";
import { PhaseCell } from "./phase-cell";

const WORKLOAD_POLL_INTERVAL_MS = 4000;
const DEFAULT_NAMESPACE = "default";

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

export const WorkloadsPage = () => {
  const operators = useQuery(api.operators.queries.list);
  const getCatalog = useAction(api.operators.actions.getCatalog);
  const deployWorkload = useAction(api.workloads.actions.deployWorkload);
  const listMyWorkloads = useAction(api.workloads.actions.listMyWorkloads);
  const getWorkloadAccessToken = useAction(
    api.workloads.actions.getWorkloadAccessToken
  );
  const requestRemoval = useAction(api.workloads.actions.requestRemoval);
  const runOperation = useAction(api.workloads.actions.runOperation);
  const removeAlert = useImperativeAlertDialog();

  const [workloads, setWorkloads] = useState<WorkloadRow[] | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<Id<"workloads">>>(
    new Set()
  );

  const [operatorId, setOperatorId] = useState<Id<"operators"> | null>(null);
  const [catalog, setCatalog] = useState<CatalogTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [workloadName, setWorkloadName] = useState("");
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE);
  const [isDeploying, setIsDeploying] = useState(false);

  // Per-operator catalogs for rows in the workloads table — a row's
  // operator isn't necessarily the one selected in the deploy form above,
  // so each unique operatorId among the current rows gets its own fetch.
  const [catalogsByOperator, setCatalogsByOperator] = useState<
    Record<string, CatalogTemplate[]>
  >({});
  const [activeOperation, setActiveOperation] = useState<{
    operation: CatalogOperation;
    row: WorkloadRow;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const rows = await listMyWorkloads({});
        if (!cancelled) {
          setWorkloads(rows);
        }
      } catch {
        // Keep showing the last known list on a transient polling failure.
      }
    };

    poll();
    // Deliberate simple client-side polling: listMyWorkloads is an action
    // (it fetches live status from the operator), and Convex actions aren't
    // subscribable the way queries are — this is a conscious POC-simplicity
    // choice, not an oversight.
    const id = setInterval(poll, WORKLOAD_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [listMyWorkloads]);

  useEffect(() => {
    // No reset-to-null on the !operatorId branch: the Template selector and
    // everything derived from `catalog`/`templateId` only ever renders inside
    // an `operatorId ? ... : null` guard below, so a stale value here is never
    // actually displayed — resetting it via setState would just be an extra
    // synchronous render for no observable effect.
    if (!operatorId) {
      return;
    }
    let cancelled = false;
    const fetchCatalog = async () => {
      const templates = await getCatalog({ operatorId });
      if (!cancelled) {
        setCatalog(templates);
        setTemplateId(null);
      }
    };
    fetchCatalog();
    return () => {
      cancelled = true;
    };
  }, [operatorId, getCatalog]);

  useEffect(() => {
    const missingOperatorIds = [
      ...new Set((workloads ?? []).map((row) => row.operatorId)),
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
  }, [workloads, catalogsByOperator, getCatalog]);

  const operationsFor = (row: WorkloadRow): CatalogOperation[] => {
    const template = catalogsByOperator[row.operatorId]?.find(
      (t) => t.id === row.templateId
    );
    return template?.operations ?? [];
  };

  const entrypointsFor = (row: WorkloadRow): Entrypoint[] => {
    const template = catalogsByOperator[row.operatorId]?.find(
      (t) => t.id === row.templateId
    );
    return template?.entrypoints ?? [];
  };

  const selectedTemplate = catalog?.find((t) => t.id === templateId) ?? null;

  const handleSelectTemplate = (id: string) => {
    setTemplateId(id);
  };

  const handleDeploy = async (values: Record<string, unknown>) => {
    if (!(operatorId && templateId && workloadName)) {
      return;
    }
    setIsDeploying(true);
    try {
      await deployWorkload({
        name: workloadName,
        namespace,
        operatorId,
        params: values,
        templateId,
      });
      setWorkloadName("");
      const rows = await listMyWorkloads({});
      setWorkloads(rows);
    } finally {
      setIsDeploying(false);
    }
  };

  const removeWorkload = async (workloadId: Id<"workloads">) => {
    setRemovingIds((prev) => new Set(prev).add(workloadId));
    try {
      await requestRemoval({ workloadId });
      const rows = await listMyWorkloads({});
      setWorkloads(rows);
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(workloadId);
        return next;
      });
      removeAlert.hide();
    }
  };

  const handleRemove = (workloadId: Id<"workloads">, name: string) => {
    removeAlert.show({
      actionLabel: "Remove",
      description: `Remove workload "${name}"? This cannot be undone.`,
      onAction: () => removeWorkload(workloadId),
      title: "Remove workload?",
    });
  };

  // entrypoint is now a mandatory path segment for every workload, single-
  // entrypoint templates included — the gateway auth cookie/token itself
  // stays scoped to (namespace, name) only, so no change needed on the
  // token-minting side, only the URL this builds.
  const handleOpen = async (
    workloadId: Id<"workloads">,
    entrypoint: string
  ) => {
    const {
      externalUrl,
      namespace: ns,
      name,
      token,
    } = await getWorkloadAccessToken({
      workloadId,
    });
    window.open(
      `${externalUrl}/gw/${ns}/${name}/${entrypoint}/?token=${encodeURIComponent(token)}`,
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

  const columns: TableColumn<WorkloadRow>[] = [
    {
      header: "Name",
      key: "name",
      renderCell: (row) => (
        <Text type="body" weight="semibold">
          {row.name}
        </Text>
      ),
    },
    {
      header: "Namespace",
      key: "namespace",
      renderCell: (row) => <Text color="secondary">{row.namespace}</Text>,
    },
    {
      header: "Template",
      key: "templateId",
      renderCell: (row) => <Text color="secondary">{row.templateId}</Text>,
    },
    {
      header: "Status",
      key: "phase",
      renderCell: (row) => <PhaseCell phase={row.phase} />,
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (row) => {
        const entrypoints = entrypointsFor(row);
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
            <Button
              isDisabled={removingIds.has(row._id)}
              label={removingIds.has(row._id) ? "Removing…" : "Remove"}
              onClick={() => handleRemove(row._id, row.name)}
              size="sm"
              variant="destructive"
            />
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
                description={`Last heartbeat: ${formatRelativeTime(operator.lastHeartbeatAt)}`}
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
            <Selector
              hasClear
              label="Cluster / operator"
              onChange={(v) => setOperatorId(v ? (v as Id<"operators">) : null)}
              options={(operators ?? [])
                .filter((o) => o.healthStatus === "healthy")
                .map((o) => ({ label: o.name, value: o._id }))}
              placeholder="Choose an operator"
              value={operatorId ?? ""}
            />

            {operatorId ? (
              <Selector
                hasClear
                isDisabled={!catalog}
                label="Template"
                onChange={(v) => v && handleSelectTemplate(v)}
                options={(catalog ?? []).map((t) => ({
                  label: `${t.icon} ${t.name}`,
                  value: t.id,
                }))}
                placeholder={catalog ? "Choose a template" : "Loading catalog…"}
                value={templateId ?? ""}
              />
            ) : null}

            {selectedTemplate ? (
              <VStack gap={3}>
                <Text color="secondary">{selectedTemplate.description}</Text>
                <TextInput
                  label="Name"
                  onChange={setWorkloadName}
                  value={workloadName}
                />
                <TextInput
                  label="Namespace"
                  onChange={setNamespace}
                  value={namespace}
                />
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
            data={workloads ?? []}
            hasHover
            idKey="_id"
          />
        </VStack>
      </VStack>
    </Section>
  );
};

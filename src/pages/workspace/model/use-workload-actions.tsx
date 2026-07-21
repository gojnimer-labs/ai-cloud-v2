import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { useToast } from "@astryxdesign/core/Toast";
import { api } from "@convex/_generated/api";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";

import type {
  CatalogOperation,
  CatalogTemplate,
} from "@/entities/catalog-parameter";
import type { WorkloadOneClickToggle } from "@/entities/workload";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";
import {
  WorkloadOperationDialog,
  WorkloadRedeployDialog,
} from "@/widgets/new-workload-dialog";

import {
  canDestroyWorkload,
  isEntrypointPermitted,
  isLifecycleActionPermitted,
  isOperationPermitted,
} from "./format";
import type { WorkloadPermissionRow } from "./types";

const findTemplate = (
  templates: CatalogTemplate[],
  workload: WorkloadPermissionRow
): CatalogTemplate | null =>
  templates.find(
    (template) =>
      template.id === workload.templateId &&
      template.version === workload.templateVersion
  ) ?? null;

// Owns every workload row action (open, run-operation, redeploy, stop,
// resume, delete) plus the menu-items array and on-demand dialogs that drive
// them — relocated verbatim (same handlers, same gating) from the deleted
// pages/workspace/ui/my-deployments.tsx, so both the always-visible MoreMenu
// and the right-click ContextMenu on each WorkloadCard share one source of
// truth instead of each wiring mutations independently.
export const useWorkloadActions = () => {
  const catalog = useQuery(api.operators.queries.listMergedCatalog);
  const toast = useToast();
  const deleteAlert = useImperativeAlertDialog();

  const requestStop = useMutation(api.workloads.mutations.requestStop);
  const requestResume = useMutation(api.workloads.mutations.requestResume);
  const requestDestroy = useMutation(api.workloads.mutations.requestDestroy);
  const requestRedeploy = useAction(api.workloads.actions.requestRedeploy);
  const runOperation = useAction(api.workloads.actions.runOperation);
  const getCatalog = useAction(api.workloads.actions.getCatalog);
  const getWorkloadAccessToken = useMutation(
    api.workloads.mutations.getWorkloadAccessToken
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeOperation, setActiveOperation] = useState<{
    operation: CatalogOperation;
    workload: WorkloadPermissionRow;
  } | null>(null);
  const [activeRedeploy, setActiveRedeploy] = useState<{
    template: CatalogTemplate;
    workload: WorkloadPermissionRow;
  } | null>(null);

  const handleOpen = async (
    workload: WorkloadPermissionRow,
    entrypoint: string
  ) => {
    try {
      const { externalUrl, name, token } = await getWorkloadAccessToken({
        workloadId: workload._id,
      });
      window.open(
        `${externalUrl}/gw/${name}/${entrypoint}/?token=${encodeURIComponent(token)}`,
        "_blank"
      );
    } catch (error) {
      toast({
        body: m.workspace_deployment_open_error({
          error: getErrorMessage(error),
        }),
        type: "error",
      });
    }
  };

  const handleRunOperation = async (
    workload: WorkloadPermissionRow,
    operationKey: string
  ) => {
    const templates = await getCatalog({ workloadId: workload._id });
    const template = findTemplate(templates, workload);
    const operation = template?.operations?.find(
      (candidate) => candidate.key === operationKey
    );
    if (operation) {
      setActiveOperation({ operation, workload });
    }
  };

  const handleOpenRedeploy = async (workload: WorkloadPermissionRow) => {
    const templates = await getCatalog({ workloadId: workload._id });
    const template = findTemplate(templates, workload);
    if (template) {
      setActiveRedeploy({ template, workload });
    }
  };

  const handleStop = async (workload: WorkloadPermissionRow) => {
    setBusyId(workload._id);
    try {
      await requestStop({ workloadId: workload._id });
      toast({ body: m.toast_workload_stop_success() });
    } catch (error) {
      toast({
        body: m.toast_workload_stop_error({ error: getErrorMessage(error) }),
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleResume = async (workload: WorkloadPermissionRow) => {
    setBusyId(workload._id);
    try {
      await requestResume({ workloadId: workload._id });
      toast({ body: m.toast_workload_resume_success() });
    } catch (error) {
      toast({
        body: m.toast_workload_resume_error({ error: getErrorMessage(error) }),
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (workload: WorkloadPermissionRow) => {
    const baseOptions = {
      actionLabel: m.workspace_deployment_delete_confirm_action(),
      description: m.workspace_deployment_delete_confirm_description({
        name: workload.displayName,
      }),
      title: m.workspace_deployment_delete_confirm_title(),
    };
    const onAction = async () => {
      // oxlint-disable-next-line react/react-compiler -- onAction refers to itself so a retry click after a failure reuses the same handler; same pattern as admin-presets' confirmDelete.
      deleteAlert.show({ ...baseOptions, isActionLoading: true, onAction });
      try {
        await requestDestroy({ workloadId: workload._id });
        deleteAlert.hide();
        toast({ body: m.toast_workload_destroy_success() });
      } catch (error) {
        deleteAlert.show({ ...baseOptions, isActionLoading: false, onAction });
        toast({
          body: m.toast_workload_destroy_error({
            error: getErrorMessage(error),
          }),
          type: "error",
        });
      }
    };
    deleteAlert.show({ ...baseOptions, onAction });
  };

  const buildMenuItems = (workload: WorkloadPermissionRow) => {
    const template = catalog ? findTemplate(catalog, workload) : null;
    const entrypoints = (template?.entrypoints ?? []).filter((entrypoint) =>
      isEntrypointPermitted(workload.allowedEntrypoints, entrypoint.name)
    );
    const operations = (template?.operations ?? []).filter((operation) =>
      isOperationPermitted(workload.allowedOperations, operation.key)
    );

    const accessGroup = [
      ...entrypoints.map((entrypoint) => ({
        icon: ArrowTopRightOnSquareIcon,
        label:
          entrypoints.length > 1 ? entrypoint.label : m.admin_workload_open(),
        onClick: () => handleOpen(workload, entrypoint.name),
      })),
      ...operations.map((operation) => ({
        icon: BoltIcon,
        label: operation.label,
        onClick: () => handleRunOperation(workload, operation.key),
      })),
    ];

    const lifecycleGroup = [
      ...(workload.status === "active" &&
      isLifecycleActionPermitted(workload.allowedLifecycleActions, "redeploy")
        ? [
            {
              icon: ArrowPathIcon,
              label: m.admin_workload_redeploy(),
              onClick: () => handleOpenRedeploy(workload),
            },
          ]
        : []),
      ...(workload.status === "active" &&
      isLifecycleActionPermitted(workload.allowedLifecycleActions, "stop")
        ? [
            {
              icon: PauseIcon,
              label: m.admin_workload_pause(),
              onClick: () => handleStop(workload),
            },
          ]
        : []),
      ...(workload.status === "stopped" &&
      isLifecycleActionPermitted(workload.allowedLifecycleActions, "resume")
        ? [
            {
              icon: PlayIcon,
              label: m.admin_workload_resume(),
              onClick: () => handleResume(workload),
            },
          ]
        : []),
    ];

    const destroyGroup =
      canDestroyWorkload(workload.status) &&
      isLifecycleActionPermitted(workload.allowedLifecycleActions, "destroy")
        ? [
            {
              icon: TrashIcon,
              label: m.workspace_deployment_delete(),
              onClick: () => confirmDelete(workload),
            },
          ]
        : [];

    return [accessGroup, lifecycleGroup, destroyGroup]
      .filter((group) => group.length > 0)
      .flatMap((group, index) =>
        index === 0 ? group : [{ type: "divider" as const }, ...group]
      );
  };

  // The single 1-click Stop/Resume toggle plus the single-entrypoint Open
  // button — pre-resolved here so WorkloadCard never re-derives permission
  // logic. Multi-entrypoint workloads leave onOpen undefined (ambiguous
  // which one a bare click should hit) and rely on buildMenuItems listing
  // each entrypoint individually instead, same as today.
  const resolveOneClickActions = (
    workload: WorkloadPermissionRow
  ): {
    onOpen: (() => void) | undefined;
    onToggleLifecycle: WorkloadOneClickToggle | undefined;
  } => {
    const template = catalog ? findTemplate(catalog, workload) : null;
    const entrypoints = (template?.entrypoints ?? []).filter((entrypoint) =>
      isEntrypointPermitted(workload.allowedEntrypoints, entrypoint.name)
    );
    const onOpen =
      entrypoints.length === 1
        ? () => handleOpen(workload, entrypoints[0].name)
        : undefined;

    let onToggleLifecycle: WorkloadOneClickToggle | undefined;
    if (
      workload.status === "active" &&
      isLifecycleActionPermitted(workload.allowedLifecycleActions, "stop")
    ) {
      onToggleLifecycle = {
        icon: PauseIcon,
        label: m.admin_workload_pause(),
        onClick: () => handleStop(workload),
      };
    } else if (
      workload.status === "stopped" &&
      isLifecycleActionPermitted(workload.allowedLifecycleActions, "resume")
    ) {
      onToggleLifecycle = {
        icon: PlayIcon,
        label: m.admin_workload_resume(),
        onClick: () => handleResume(workload),
      };
    }

    return { onOpen, onToggleLifecycle };
  };

  const dialogsElement = (
    <>
      <Dialog
        isOpen={Boolean(activeOperation)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveOperation(null);
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
                  onClose={() => setActiveOperation(null)}
                  onRun={(values) =>
                    runOperation({
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
                onOpenChange={() => setActiveOperation(null)}
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
            setActiveRedeploy(null);
          }
        }}
        purpose="form"
        width={480}
      >
        {activeRedeploy ? (
          <Layout
            content={
              <LayoutContent>
                <WorkloadRedeployDialog
                  config={undefined}
                  key={activeRedeploy.workload._id}
                  onClose={() => setActiveRedeploy(null)}
                  onRedeploy={(values) =>
                    requestRedeploy({
                      params: values,
                      workloadId: activeRedeploy.workload._id,
                    })
                  }
                  template={activeRedeploy.template}
                />
              </LayoutContent>
            }
            header={
              <DialogHeader
                onOpenChange={() => setActiveRedeploy(null)}
                title={m.admin_workload_redeploy_title({
                  name: activeRedeploy.workload.displayName,
                })}
              />
            }
          />
        ) : null}
      </Dialog>

      {deleteAlert.element}
    </>
  );

  return {
    buildMenuItems,
    busyId,
    dialogsElement,
    resolveOneClickActions,
  };
};

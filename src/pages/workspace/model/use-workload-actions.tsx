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
import type { WorkloadEntrypoint, WorkloadPermissionRow } from "./types";

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

  // The card's click-to-act surface: every permitted entrypoint (so
  // WorkloadCard can open it directly when there's exactly one, or show an
  // inline picker when there's more than one), the Resume callback for a
  // paused workload, and the Update callback for a "ready" workload whose
  // source preset has moved on (see entities/workload's "update-available"
  // interaction state) — pre-resolved here so WorkloadCard never re-derives
  // permission logic. Stop is intentionally NOT included: it now lives only
  // in buildMenuItems (MoreMenu/ContextMenu), since the card's center
  // click-target is reserved for Open/Resume, not a destructive-adjacent
  // lifecycle change. onUpdate reuses the same redeploy flow as the
  // "Redeploy" menu item (opens WorkloadRedeployDialog pre-filled with the
  // current template) rather than silently bumping to latest — the user
  // still reviews/confirms params before anything actually redeploys.
  const resolveCardInteraction = (
    workload: WorkloadPermissionRow
  ): {
    entrypoints: WorkloadEntrypoint[];
    onResume: (() => void) | undefined;
    onUpdate: (() => void) | undefined;
  } => {
    const template = catalog ? findTemplate(catalog, workload) : null;
    const permittedEntrypoints = (template?.entrypoints ?? []).filter(
      (entrypoint) =>
        isEntrypointPermitted(workload.allowedEntrypoints, entrypoint.name)
    );
    const entrypoints: WorkloadEntrypoint[] = permittedEntrypoints.map(
      (entrypoint) => ({
        label:
          permittedEntrypoints.length > 1
            ? entrypoint.label
            : m.admin_workload_open(),
        name: entrypoint.name,
        onSelect: () => handleOpen(workload, entrypoint.name),
      })
    );

    const onResume =
      workload.status === "stopped" &&
      isLifecycleActionPermitted(workload.allowedLifecycleActions, "resume")
        ? () => handleResume(workload)
        : undefined;

    const onUpdate =
      workload.status === "active" &&
      isLifecycleActionPermitted(workload.allowedLifecycleActions, "redeploy")
        ? () => handleOpenRedeploy(workload)
        : undefined;

    return { entrypoints, onResume, onUpdate };
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
    resolveCardInteraction,
  };
};

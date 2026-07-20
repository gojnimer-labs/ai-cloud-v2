import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
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
  formatDate,
  isEntrypointPermitted,
  isLifecycleActionPermitted,
  isOperationPermitted,
  workloadStatusIsPulsing,
  workloadStatusLabel,
  workloadStatusVariant,
} from "../model/format";
import type { MyDeploymentRow } from "../model/types";

const findTemplate = (
  templates: CatalogTemplate[],
  workload: MyDeploymentRow
): CatalogTemplate | null =>
  templates.find(
    (template) =>
      template.id === workload.templateId &&
      template.version === workload.templateVersion
  ) ?? null;

// A user's own deployed instances, live-updating as claim/heartbeat moves
// each one through requested -> provisioning -> active — so a workload
// deployed from a preset shows up here immediately, not just on the admin
// Fleet page. Deliberately a plain dense List (edge-to-edge rows), not the
// PresetItem card grid above it on the page: these are two different kinds
// of thing (a catalog entry to deploy vs. an instance already running).
//
// Each row's MoreMenu mirrors admin-clusters' WorkloadDetailPanel (same
// grouped access/lifecycle/destroy shape) but every item is additionally
// gated on the workload's resolved preset permissions (allowedEntrypoints/
// allowedOperations/allowedLifecycleActions from listMine) — an admin who
// didn't grant "redeploy" on the source preset, for example, simply never
// sees a Redeploy item here, and the backend re-checks the same grant
// independently (see convex/workloads/actions.ts#requestRedeploy) so hiding
// the menu item is a UX nicety, not the actual boundary.
export const MyDeployments = () => {
  const workloads = useQuery(api.workloads.queries.listMine);
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

  const [activeOperation, setActiveOperation] = useState<{
    operation: CatalogOperation;
    workload: MyDeploymentRow;
  } | null>(null);
  const [activeRedeploy, setActiveRedeploy] = useState<{
    template: CatalogTemplate;
    workload: MyDeploymentRow;
  } | null>(null);

  const handleOpen = async (workload: MyDeploymentRow, entrypoint: string) => {
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
    workload: MyDeploymentRow,
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

  const handleOpenRedeploy = async (workload: MyDeploymentRow) => {
    const templates = await getCatalog({ workloadId: workload._id });
    const template = findTemplate(templates, workload);
    if (template) {
      setActiveRedeploy({ template, workload });
    }
  };

  const handleStop = async (workload: MyDeploymentRow) => {
    try {
      await requestStop({ workloadId: workload._id });
      toast({ body: m.toast_workload_stop_success() });
    } catch (error) {
      toast({
        body: m.toast_workload_stop_error({ error: getErrorMessage(error) }),
        type: "error",
      });
    }
  };

  const handleResume = async (workload: MyDeploymentRow) => {
    try {
      await requestResume({ workloadId: workload._id });
      toast({ body: m.toast_workload_resume_success() });
    } catch (error) {
      toast({
        body: m.toast_workload_resume_error({ error: getErrorMessage(error) }),
        type: "error",
      });
    }
  };

  const confirmDelete = (workload: MyDeploymentRow) => {
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

  if (!workloads || workloads.length === 0) {
    return null;
  }

  const buildMenuItems = (workload: MyDeploymentRow) => {
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

  return (
    <>
      <List
        hasDividers
        header={
          <Heading level={3}>{m.workspace_my_deployments_title()}</Heading>
        }
      >
        {workloads.map((workload) => {
          const menuItems = buildMenuItems(workload);
          return (
            <ListItem
              description={workload.templateId}
              endContent={
                <HStack gap={2} vAlign="center">
                  <Text color="secondary" type="supporting">
                    {formatDate(workload.createdAt)}
                  </Text>
                  <StatusDot
                    isPulsing={workloadStatusIsPulsing(workload.status)}
                    label={workloadStatusLabel(workload.status)}
                    variant={workloadStatusVariant(workload.status)}
                  />
                  <Text>{workloadStatusLabel(workload.status)}</Text>
                  {menuItems.length > 0 ? (
                    <MoreMenu
                      items={menuItems}
                      label={m.workspace_deployment_actions()}
                    />
                  ) : null}
                </HStack>
              }
              key={workload._id}
              label={workload.displayName}
            />
          );
        })}
      </List>

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
};

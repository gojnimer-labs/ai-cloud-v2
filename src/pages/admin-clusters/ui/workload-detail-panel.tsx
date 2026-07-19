import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import type { ResizableProps } from "@astryxdesign/core/Resizable";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import type {
  CatalogOperation,
  Entrypoint,
} from "@/entities/catalog-parameter";
import { m } from "@/paraglide/messages";

import {
  canDestroyWorkload,
  workloadStatusIsPulsing,
  workloadStatusLabel,
  workloadStatusVariant,
} from "../model/format";
import type { ClusterWorkloadRow } from "../model/types";

export const WorkloadDetailPanel = ({
  entrypoints,
  onClose,
  onDestroy,
  onOpen,
  onRedeploy,
  onResume,
  onRunOperation,
  onStop,
  operations,
  resizable,
  workload,
}: {
  entrypoints: Entrypoint[];
  onClose: () => void;
  onDestroy: (workload: ClusterWorkloadRow) => void;
  onOpen: (workload: ClusterWorkloadRow, entrypointName: string) => void;
  onRedeploy: (workload: ClusterWorkloadRow) => void;
  onResume: (workload: ClusterWorkloadRow) => void;
  onRunOperation: (
    workload: ClusterWorkloadRow,
    operation: CatalogOperation
  ) => void;
  onStop: (workload: ClusterWorkloadRow) => void;
  operations: CatalogOperation[];
  resizable: ResizableProps;
  workload: ClusterWorkloadRow | null;
}) => {
  if (!workload) {
    return null;
  }

  // Mirrors src/pages/workloads/ui/status-cell.tsx's isRecovered: an
  // active/stopped row with a leftover failureReason went through a rocky
  // create/redeploy/stop/resume attempt that didn't take, not a current
  // failure — the CR is genuinely fine, so this must read as a resolved
  // warning rather than an active "Failure reason", or a healthy workload
  // looks broken.
  const isRecovered =
    (workload.status === "active" || workload.status === "stopped") &&
    Boolean(workload.failureReason);

  // Grouped so a divider only ever appears between two non-empty groups —
  // "Open"/catalog-operation buttons, then lifecycle transitions, then the
  // destructive action, matching cluster-detail-panel.tsx's MoreMenu shape.
  const accessGroup = [
    ...entrypoints.map((entrypoint) => ({
      icon: ArrowTopRightOnSquareIcon,
      label:
        entrypoints.length > 1 ? entrypoint.label : m.admin_workload_open(),
      onClick: () => onOpen(workload, entrypoint.name),
    })),
    ...operations.map((operation) => ({
      icon: BoltIcon,
      label: operation.label,
      onClick: () => onRunOperation(workload, operation),
    })),
  ];
  const lifecycleGroup = [
    ...(workload.status === "active"
      ? [
          {
            icon: ArrowPathIcon,
            label: m.admin_workload_redeploy(),
            onClick: () => onRedeploy(workload),
          },
          {
            icon: PauseIcon,
            label: m.admin_workload_pause(),
            onClick: () => onStop(workload),
          },
        ]
      : []),
    ...(workload.status === "stopped"
      ? [
          {
            icon: PlayIcon,
            label: m.admin_workload_resume(),
            onClick: () => onResume(workload),
          },
        ]
      : []),
  ];
  const destroyGroup = canDestroyWorkload(workload.status)
    ? [
        {
          icon: TrashIcon,
          label:
            workload.status === "failed"
              ? m.admin_workload_dismiss()
              : m.admin_workload_destroy(),
          onClick: () => onDestroy(workload),
        },
      ]
    : [];
  const menuItems = [accessGroup, lifecycleGroup, destroyGroup]
    .filter((group) => group.length > 0)
    .flatMap((group, index) =>
      index === 0 ? group : [{ type: "divider" as const }, ...group]
    );

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
              {m.admin_workload_details_label()}
            </Text>
          </StackItem>
          {menuItems.length > 0 ? (
            <MoreMenu items={menuItems} label={m.admin_workload_actions()} />
          ) : null}
          <Button
            icon={<Icon icon={XMarkIcon} size="sm" />}
            isIconOnly
            label={m.close_panel()}
            onClick={onClose}
            size="sm"
            variant="ghost"
          />
        </HStack>

        <Heading level={3}>{workload.displayName}</Heading>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label={m.admin_field_status()}>
            <HStack gap={2} vAlign="center">
              <StatusDot
                isPulsing={workloadStatusIsPulsing(workload.status)}
                label={workloadStatusLabel(workload.status)}
                variant={
                  isRecovered
                    ? "warning"
                    : workloadStatusVariant(workload.status)
                }
              />
              {/* StatusDot's `label` is aria-only — it renders no visible
                  text on its own. */}
              <Text>{workloadStatusLabel(workload.status)}</Text>
            </HStack>
          </MetadataListItem>
          {workload.failureReason ? (
            <MetadataListItem
              label={
                isRecovered
                  ? m.admin_field_recovered_issue()
                  : m.admin_field_failure_reason()
              }
            >
              {workload.failureReason}
            </MetadataListItem>
          ) : null}
          {workload.name ? (
            <MetadataListItem label={m.label_name()}>
              {workload.name}
            </MetadataListItem>
          ) : null}
          <MetadataListItem label={m.admin_field_cluster()}>
            {workload.clusterName}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_template()}>
            {workload.templateId}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_namespace()}>
            {workload.namespace ?? "—"}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_user()}>
            {workload.userEmail}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_created()}>
            <Timestamp value={new Date(workload.createdAt).toISOString()} />
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </LayoutPanel>
  );
};

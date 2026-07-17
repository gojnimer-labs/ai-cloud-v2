import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import type { ResizableProps } from "@astryxdesign/core/Resizable";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { m } from "@/paraglide/messages";

import {
  workloadStatusIsPulsing,
  workloadStatusLabel,
  workloadStatusVariant,
} from "../model/format";
import type { ClusterWorkloadRow } from "../model/types";

export const WorkloadDetailPanel = ({
  onClose,
  resizable,
  workload,
}: {
  onClose: () => void;
  resizable: ResizableProps;
  workload: ClusterWorkloadRow | null;
}) => {
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
              {m.admin_workload_details_label()}
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

        <Heading level={3}>{workload.displayName}</Heading>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label={m.admin_field_status()}>
            <StatusDot
              isPulsing={workloadStatusIsPulsing(workload.status)}
              label={workloadStatusLabel(workload.status)}
              variant={workloadStatusVariant(workload.status)}
            />
          </MetadataListItem>
          {workload.failureReason ? (
            <MetadataListItem label={m.admin_field_failure_reason()}>
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

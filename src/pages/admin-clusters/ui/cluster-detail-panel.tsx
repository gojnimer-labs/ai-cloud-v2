import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import type { ResizableProps } from "@astryxdesign/core/Resizable";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import {
  ArrowPathIcon,
  LockClosedIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { m } from "@/paraglide/messages";

import {
  formatByteUsage,
  formatMilliCpuUsage,
  healthStatusLabel,
  healthStatusVariant,
  resourceUsageVariant,
  retentionPolicyLabel,
} from "../model/format";
import type { ClusterSummary } from "../model/types";

export const ClusterDetailPanel = ({
  cluster,
  onClose,
  onDelete,
  onEdit,
  onReroll,
  resizable,
}: {
  cluster: ClusterSummary | null;
  onClose: () => void;
  onDelete: (cluster: ClusterSummary) => void;
  onEdit: (cluster: ClusterSummary) => void;
  onReroll: (cluster: ClusterSummary) => void;
  resizable: ResizableProps;
}) => {
  if (!cluster) {
    return null;
  }
  return (
    <LayoutPanel
      hasDivider
      isScrollable
      label={m.admin_cluster_details_label()}
      padding={4}
      resizable={resizable}
    >
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text color="secondary" type="supporting">
              {m.admin_cluster_details_label()}
            </Text>
          </StackItem>
          <MoreMenu
            items={[
              {
                icon: PencilIcon,
                label: m.admin_clusters_edit(),
                onClick: () => onEdit(cluster),
              },
              {
                icon: ArrowPathIcon,
                label: m.admin_clusters_reroll_token(),
                onClick: () => onReroll(cluster),
              },
              { type: "divider" as const },
              {
                icon: TrashIcon,
                label: m.admin_clusters_delete(),
                onClick: () => onDelete(cluster),
              },
            ]}
            label={m.admin_clusters_row_actions()}
          />
          <Button
            icon={<Icon icon={XMarkIcon} size="sm" />}
            isIconOnly
            label={m.close_panel()}
            onClick={onClose}
            size="sm"
            variant="ghost"
          />
        </HStack>

        <Heading level={3}>{cluster.name}</Heading>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label={m.admin_field_status()}>
            <HStack gap={2} vAlign="center">
              <StatusDot
                isPulsing={cluster.healthStatus === "healthy"}
                label={healthStatusLabel(cluster.healthStatus)}
                variant={healthStatusVariant(cluster.healthStatus)}
              />
              {/* StatusDot's `label` is aria-only — it renders no visible
                  text on its own. */}
              <Text>{healthStatusLabel(cluster.healthStatus)}</Text>
            </HStack>
          </MetadataListItem>
          {cluster.description ? (
            <MetadataListItem label={m.admin_field_description()}>
              {cluster.description}
            </MetadataListItem>
          ) : null}
          <MetadataListItem label={m.admin_field_region()}>
            {cluster.region ?? "—"}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_retention_policy()}>
            {retentionPolicyLabel(cluster.retentionPolicy)}
          </MetadataListItem>
          {cluster.operatorVersion ? (
            <MetadataListItem label={m.admin_field_version()}>
              {cluster.operatorVersion}
            </MetadataListItem>
          ) : null}
          <MetadataListItem label={m.admin_field_tags()}>
            {cluster.tags.length > 0 ? (
              <VStack gap={2}>
                <HStack gap={1} wrap="wrap">
                  {cluster.tags.map((tag) => (
                    <Token
                      icon={
                        cluster.operatorTags.includes(tag) ? (
                          <Icon icon={LockClosedIcon} size="xsm" />
                        ) : undefined
                      }
                      key={tag}
                      label={tag}
                      size="sm"
                    />
                  ))}
                </HStack>
                {cluster.operatorTags.length > 0 ? (
                  <Text color="secondary" type="supporting">
                    {m.admin_field_tags_locked_hint()}
                  </Text>
                ) : null}
              </VStack>
            ) : (
              "—"
            )}
          </MetadataListItem>
          {cluster.claimedAt ? (
            <MetadataListItem label={m.admin_field_claimed_at()}>
              <Timestamp value={new Date(cluster.claimedAt).toISOString()} />
            </MetadataListItem>
          ) : null}
          {cluster.lastHeartbeatAt ? (
            <MetadataListItem label={m.admin_field_last_heartbeat()}>
              <Timestamp
                value={new Date(cluster.lastHeartbeatAt).toISOString()}
              />
            </MetadataListItem>
          ) : null}
        </MetadataList>

        <VStack gap={3}>
          <Text weight="bold">{m.admin_clusters_resource_usage_label()}</Text>
          {cluster.resourceCapacity ? (
            <VStack gap={4}>
              <ProgressBar
                hasValueLabel
                formatValueLabel={formatMilliCpuUsage}
                label={m.admin_field_cpu_usage()}
                max={cluster.resourceCapacity.allocatableMilliCpu}
                value={cluster.resourceCapacity.usedMilliCpu}
                variant={resourceUsageVariant(
                  cluster.resourceCapacity.usedMilliCpu,
                  cluster.resourceCapacity.allocatableMilliCpu
                )}
              />
              <ProgressBar
                hasValueLabel
                formatValueLabel={formatByteUsage}
                label={m.admin_field_memory_usage()}
                max={cluster.resourceCapacity.allocatableMemoryBytes}
                value={cluster.resourceCapacity.usedMemoryBytes}
                variant={resourceUsageVariant(
                  cluster.resourceCapacity.usedMemoryBytes,
                  cluster.resourceCapacity.allocatableMemoryBytes
                )}
              />
            </VStack>
          ) : (
            <Text color="secondary" type="supporting">
              {m.admin_clusters_no_resource_data()}
            </Text>
          )}
        </VStack>
      </VStack>
    </LayoutPanel>
  );
};

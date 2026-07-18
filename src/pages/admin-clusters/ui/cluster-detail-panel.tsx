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
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { m } from "@/paraglide/messages";

import {
  healthStatusLabel,
  healthStatusVariant,
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
          <MetadataListItem label={m.admin_field_tags()}>
            {cluster.tags.length > 0 ? cluster.tags.join(", ") : "—"}
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
      </VStack>
    </LayoutPanel>
  );
};

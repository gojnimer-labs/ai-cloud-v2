import { Badge } from "@astryxdesign/core/Badge";
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
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { PencilIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { m } from "@/paraglide/messages";

import type { PresetRow } from "../model/types";
import { PresetVersionHistory } from "./preset-version-history";

export const PresetDetailPanel = ({
  onClose,
  onDelete,
  onEdit,
  preset,
  resizable,
}: {
  onClose: () => void;
  onDelete: (preset: PresetRow) => void;
  onEdit: (preset: PresetRow) => void;
  preset: PresetRow | null;
  resizable: ResizableProps;
}) => {
  if (!preset) {
    return null;
  }
  return (
    <LayoutPanel
      hasDivider
      isScrollable
      label={m.admin_presets_details_label()}
      padding={4}
      resizable={resizable}
    >
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text color="secondary" type="supporting">
              {m.admin_presets_details_label()}
            </Text>
          </StackItem>
          <MoreMenu
            items={[
              {
                icon: PencilIcon,
                label: m.admin_presets_edit(),
                onClick: () => onEdit(preset),
              },
              { type: "divider" as const },
              {
                icon: TrashIcon,
                label: m.admin_presets_delete(),
                onClick: () => onDelete(preset),
              },
            ]}
            label={m.admin_presets_row_actions()}
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

        {preset.thumbnailUrl ? (
          <Thumbnail
            alt=""
            label={preset.displayName}
            src={preset.thumbnailUrl}
          />
        ) : null}

        <Heading level={3}>{preset.displayName}</Heading>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label={m.admin_field_template()}>
            {preset.templateId} · v{preset.templateVersion}
          </MetadataListItem>
          <MetadataListItem label={m.admin_presets_field_version()}>
            <Badge label={`v${preset.currentVersion}`} variant="neutral" />
          </MetadataListItem>
          <MetadataListItem label={m.admin_presets_column_groups()}>
            {preset.groupNames.length > 0 ? (
              <HStack gap={1} wrap="wrap">
                {preset.groupNames.map((name, index) => (
                  <Badge
                    key={`${name}-${index}`}
                    label={name}
                    variant={preset.groupBadgeColors[index]}
                  />
                ))}
              </HStack>
            ) : (
              <Text color="secondary">{m.admin_presets_no_groups()}</Text>
            )}
          </MetadataListItem>
          <MetadataListItem label={m.admin_presets_tags_label()}>
            {preset.desiredOperatorTags.length > 0
              ? preset.desiredOperatorTags.join(", ")
              : "—"}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_created()}>
            <Timestamp value={new Date(preset.createdAt).toISOString()} />
          </MetadataListItem>
        </MetadataList>

        <PresetVersionHistory
          currentVersion={preset.currentVersion}
          presetId={preset._id}
        />
      </VStack>
    </LayoutPanel>
  );
};

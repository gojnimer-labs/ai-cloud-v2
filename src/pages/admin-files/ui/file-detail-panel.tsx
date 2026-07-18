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
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { PencilIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { m } from "@/paraglide/messages";

import type { FileRow } from "../model/types";

export const FileDetailPanel = ({
  file,
  onClose,
  onDelete,
  onEdit,
  resizable,
}: {
  file: FileRow | null;
  onClose: () => void;
  onDelete: (file: FileRow) => void;
  onEdit: (file: FileRow) => void;
  resizable: ResizableProps;
}) => {
  if (!file) {
    return null;
  }
  return (
    <LayoutPanel
      hasDivider
      isScrollable
      label={m.admin_files_details_label()}
      padding={4}
      resizable={resizable}
    >
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text color="secondary" type="supporting">
              {m.admin_files_details_label()}
            </Text>
          </StackItem>
          <MoreMenu
            items={[
              {
                icon: PencilIcon,
                label: m.admin_files_edit(),
                onClick: () => onEdit(file),
              },
              { type: "divider" as const },
              {
                icon: TrashIcon,
                label: m.admin_files_delete(),
                onClick: () => onDelete(file),
              },
            ]}
            label={m.admin_files_row_actions()}
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

        <Heading level={3}>{file.label}</Heading>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label={m.admin_field_group()}>
            {file.group}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_type()}>
            {file.type}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_user()}>
            {file.userEmail}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_r2_bucket()}>
            {file.r2Bucket}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_r2_key()}>
            {file.r2Key}
          </MetadataListItem>
          <MetadataListItem label={m.admin_field_created()}>
            <Timestamp value={new Date(file.createdAt).toISOString()} />
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </LayoutPanel>
  );
};

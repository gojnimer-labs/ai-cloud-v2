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
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { XCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { m } from "@/paraglide/messages";

import {
  inviteStatusLabel,
  inviteStatusVariant,
  userRoleLabel,
} from "../model/format";
import type { InviteRow } from "../model/types";

export const InviteDetailPanel = ({
  invite,
  onCancel,
  onClose,
  resizable,
}: {
  invite: InviteRow | null;
  onCancel: (invite: InviteRow) => void;
  onClose: () => void;
  resizable: ResizableProps;
}) => {
  if (!invite) {
    return null;
  }
  return (
    <LayoutPanel
      hasDivider
      isScrollable
      label={m.admin_users_invite_details_label()}
      padding={4}
      resizable={resizable}
    >
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text color="secondary" type="supporting">
              {m.admin_users_invite_details_label()}
            </Text>
          </StackItem>
          {invite.status === "pending" ? (
            <MoreMenu
              items={[
                {
                  icon: XCircleIcon,
                  label: m.admin_users_invite_action_cancel(),
                  onClick: () => onCancel(invite),
                },
              ]}
              label={m.admin_users_row_actions()}
            />
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

        <Heading level={3}>{invite.email}</Heading>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label={m.admin_users_invites_column_status()}>
            <Badge
              label={inviteStatusLabel(invite.status)}
              variant={inviteStatusVariant(invite.status)}
            />
          </MetadataListItem>
          <MetadataListItem label={m.admin_users_column_role()}>
            {userRoleLabel(invite.role)}
          </MetadataListItem>
          <MetadataListItem label={m.admin_users_invites_column_created_by()}>
            {invite.createdByEmail}
          </MetadataListItem>
          <MetadataListItem label={m.admin_users_column_created()}>
            <Timestamp value={new Date(invite.createdAt).toISOString()} />
          </MetadataListItem>
          <MetadataListItem label={m.admin_users_invites_column_expires()}>
            <Timestamp value={new Date(invite.expiresAt).toISOString()} />
          </MetadataListItem>
        </MetadataList>
      </VStack>
    </LayoutPanel>
  );
};

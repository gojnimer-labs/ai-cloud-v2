import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import type { ResizableProps } from "@astryxdesign/core/Resizable";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  NoSymbolIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";

import { m } from "@/paraglide/messages";

import { userRoleLabel } from "../model/format";
import type { AdminUserRow } from "../model/types";

export const UserDetailPanel = ({
  onBan,
  onClose,
  onToggleAdmin,
  onUnban,
  resizable,
  user,
}: {
  onBan: (user: AdminUserRow) => void;
  onClose: () => void;
  onToggleAdmin: (user: AdminUserRow) => void;
  onUnban: (user: AdminUserRow) => void;
  resizable: ResizableProps;
  user: AdminUserRow | null;
}) => {
  const allGroups = useQuery(api.groups.queries.listGroups);
  const userGroups = useQuery(
    api.groups.queries.listGroupsForUser,
    user ? { userId: user.id } : "skip"
  );
  const setUserGroups = useMutation(api.groups.mutations.setUserGroups);

  const groupOptions = useMemo(
    () =>
      (allGroups ?? []).map((group) => ({
        label: group.name,
        value: group._id,
      })),
    [allGroups]
  );
  const selectedGroupIds = useMemo(
    () => (userGroups ?? []).map((group) => group._id),
    [userGroups]
  );

  if (!user) {
    return null;
  }
  return (
    <LayoutPanel
      hasDivider
      isScrollable
      label={m.admin_users_details_label()}
      padding={4}
      resizable={resizable}
    >
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text color="secondary" type="supporting">
              {m.admin_users_details_label()}
            </Text>
          </StackItem>
          <MoreMenu
            items={[
              {
                icon:
                  user.role === "admin"
                    ? ShieldExclamationIcon
                    : ShieldCheckIcon,
                label:
                  user.role === "admin"
                    ? m.admin_users_action_remove_admin()
                    : m.admin_users_action_make_admin(),
                onClick: () => onToggleAdmin(user),
              },
              { type: "divider" as const },
              user.banned
                ? {
                    icon: ShieldCheckIcon,
                    label: m.admin_users_action_unban(),
                    onClick: () => onUnban(user),
                  }
                : {
                    icon: NoSymbolIcon,
                    label: m.admin_users_action_ban(),
                    onClick: () => onBan(user),
                  },
            ]}
            label={m.admin_users_row_actions()}
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

        <Heading level={3}>{user.name}</Heading>

        <MetadataList label={{ position: "start" }}>
          <MetadataListItem label={m.admin_users_column_email()}>
            {user.email}
          </MetadataListItem>
          <MetadataListItem label={m.admin_users_column_role()}>
            {userRoleLabel(user.role)}
          </MetadataListItem>
          <MetadataListItem label={m.admin_users_column_status()}>
            <HStack gap={2} vAlign="center">
              <StatusDot
                label={
                  user.banned
                    ? m.admin_users_status_banned()
                    : m.admin_users_status_active()
                }
                variant={user.banned ? "error" : "success"}
              />
              {/* StatusDot's `label` is aria-only — it renders no visible
                  text on its own. */}
              <Text>
                {user.banned
                  ? m.admin_users_status_banned()
                  : m.admin_users_status_active()}
              </Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label={m.admin_users_column_created()}>
            <Timestamp value={new Date(user.createdAt).toISOString()} />
          </MetadataListItem>
        </MetadataList>

        <MultiSelector
          hasSearch
          isLoading={userGroups === undefined}
          label={m.admin_users_groups_label()}
          onChange={(value) =>
            setUserGroups({
              groupIds: value as Id<"groups">[],
              userId: user.id,
            })
          }
          options={groupOptions}
          placeholder={m.admin_users_groups_placeholder()}
          triggerDisplay="badges"
          value={selectedGroupIds}
        />
      </VStack>
    </LayoutPanel>
  );
};

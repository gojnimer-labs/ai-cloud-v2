import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Popover } from "@astryxdesign/core/Popover";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import {
  ACCOUNT_STATUS_OPTIONS,
  accountStatusFromBanned,
  USER_ROLE_OPTIONS,
} from "../model/format";
import type { AdminUserTableRow, UsersGroupByField } from "../model/types";
import { useAdminUsers } from "../model/use-admin-users";
import { UserDetailPanel } from "./user-detail-panel";
import { UsersTable } from "./users-table";

const USER_FIELD_DEFS = [
  { key: "name", label: m.admin_users_column_name(), type: "string" },
  { key: "email", label: m.admin_users_column_email(), type: "string" },
  {
    enumValues: USER_ROLE_OPTIONS,
    key: "role",
    label: m.admin_users_column_role(),
    type: "enum",
  },
  {
    enumValues: ACCOUNT_STATUS_OPTIONS,
    key: "status",
    label: m.admin_users_column_status(),
    type: "enum",
  },
] as const;

// Banned users are hidden by default so the page opens on the roster an
// admin actually manages day to day — clearing this filter (or flipping it
// to "is banned") surfaces them again, same as admin-clusters hides
// destroyed workloads by default.
const DEFAULT_FILTERS: PowerSearchFilter[] = [
  {
    field: "status",
    operator: "is_not",
    value: { type: "enum", value: "banned" },
  },
];

const GROUP_BY_OPTIONS: { value: UsersGroupByField; label: string }[] = [
  { label: m.admin_users_group_by_none(), value: "none" },
  { label: m.admin_users_group_by_group(), value: "group" },
];

export const UsersPage = () => {
  const { banAlertElement, confirmBan, error, toggleAdmin, unban, users } =
    useAdminUsers();
  const groups = useQuery(api.groups.queries.listGroups);
  const memberships = useQuery(api.groups.queries.listGroupMemberships);

  const [selectedUser, setSelectedUser] = useState<AdminUserTableRow | null>(
    null
  );
  const [groupBy, setGroupBy] = useState<UsersGroupByField>("none");
  const [filters, setFilters] = useState<PowerSearchFilter[]>(DEFAULT_FILTERS);
  const { applyFilters, config } = usePowerSearchConfig(
    USER_FIELD_DEFS,
    "AdminUsersSearch"
  );

  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

  const groupIdsByUser = useMemo(() => {
    const map = new Map<string, Id<"groups">[]>();
    for (const membership of memberships ?? []) {
      const existing = map.get(membership.userId);
      if (existing) {
        existing.push(membership.groupId);
      } else {
        map.set(membership.userId, [membership.groupId]);
      }
    }
    return map;
  }, [memberships]);

  const groupNameById = useMemo(
    () => new Map((groups ?? []).map((group) => [group._id, group.name])),
    [groups]
  );

  // PowerSearch's field-based filtering wants plain present values, not the
  // raw "banned" boolean — see the doc comment on ACCOUNT_STATUS_OPTIONS in
  // model/format.ts for why this derives a "status" enum instead.
  const rows = useMemo<AdminUserTableRow[]>(
    () =>
      (users ?? []).map((user) => {
        const groupIds = groupIdsByUser.get(user.id) ?? [];
        return {
          ...user,
          groupIds,
          groupNames: groupIds
            .map((groupId) => groupNameById.get(groupId))
            .filter((name): name is string => Boolean(name)),
          status: accountStatusFromBanned(user.banned),
        };
      }),
    [users, groupIdsByUser, groupNameById]
  );

  const filteredRows = applyFilters(filters, rows);

  if (error) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{error}</Text>
      </Center>
    );
  }

  if (users === null) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_users_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Card height="100%" padding={0}>
        <Layout
          content={
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
            <LayoutContent padding={0} role="main">
              <UsersTable
                allGroups={groups ?? []}
                groupBy={groupBy}
                hasActiveFilters={filters.length > 0}
                onSelectUser={setSelectedUser}
                rows={filteredRows}
              />
            </LayoutContent>
          }
          end={
            selectedUser && (
              <>
                <ResizeHandle
                  isAlwaysVisible={false}
                  isReversed
                  resizable={detailPanel.props}
                />
                <UserDetailPanel
                  onBan={confirmBan}
                  onClose={() => setSelectedUser(null)}
                  onToggleAdmin={toggleAdmin}
                  onUnban={unban}
                  resizable={detailPanel.props}
                  user={selectedUser}
                />
              </>
            )
          }
          header={
            <LayoutHeader hasDivider padding={4}>
              <VStack gap={4}>
                <HStack gap={3} vAlign="center">
                  <StackItem size="fill">
                    <Heading level={1}>{m.nav_users()}</Heading>
                  </StackItem>
                </HStack>
                <HStack gap={2} vAlign="center">
                  <StackItem size="fill">
                    <PowerSearch
                      config={config}
                      filters={filters}
                      onChange={(newFilters) => setFilters([...newFilters])}
                      placeholder={m.admin_users_search_placeholder()}
                      popoverSaveButtonLabel={m.apply()}
                      resultCount={filteredRows.length}
                    />
                  </StackItem>
                  <Popover
                    alignment="end"
                    content={
                      <VStack gap={4}>
                        <RadioList
                          label={m.admin_users_group_by_label()}
                          onChange={(value) =>
                            setGroupBy(value as UsersGroupByField)
                          }
                          value={groupBy}
                        >
                          {GROUP_BY_OPTIONS.map((option) => (
                            <RadioListItem
                              key={option.value}
                              label={option.label}
                              value={option.value}
                            />
                          ))}
                        </RadioList>
                      </VStack>
                    }
                    label={m.admin_users_grouping_options_label()}
                    placement="below"
                    width={320}
                  >
                    <Button label={m.view_options()} variant="secondary" />
                  </Popover>
                </HStack>
              </VStack>
            </LayoutHeader>
          }
          height="fill"
        />
      </Card>

      {banAlertElement}
    </Section>
  );
};

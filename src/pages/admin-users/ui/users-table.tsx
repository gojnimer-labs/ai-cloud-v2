import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { VStack } from "@astryxdesign/core/Stack";
import type { TableColumn, TablePlugin } from "@astryxdesign/core/Table";
import { pixel, proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import {
  formatDate,
  USER_ROLE_OPTIONS,
  userRoleLabel,
  userRoleVariant,
} from "../model/format";
import type { AdminUserRow } from "../model/types";

// One entry per Better Auth admin-plugin user field this page filters on.
const USER_FIELD_DEFS = [
  { key: "name", label: m.admin_users_column_name(), type: "string" },
  { key: "email", label: m.admin_users_column_email(), type: "string" },
  {
    enumValues: USER_ROLE_OPTIONS,
    key: "role",
    label: m.admin_users_column_role(),
    type: "enum",
  },
  { key: "banned", label: m.admin_users_column_status(), type: "boolean" },
] as const;

// Banned users are hidden by default so the page opens on the roster an
// admin actually manages day to day — clearing this filter (or flipping it
// to is_true) surfaces them again, same as admin-clusters hides destroyed
// workloads by default.
const DEFAULT_FILTERS: PowerSearchFilter[] = [
  { field: "banned", operator: "is_false", value: { type: "empty" } },
];

export const UsersTable = ({
  error,
  onSelectUser,
  users,
}: {
  error: string | null;
  onSelectUser: (user: AdminUserRow) => void;
  users: AdminUserRow[] | null;
}) => {
  const [filters, setFilters] = useState<PowerSearchFilter[]>(DEFAULT_FILTERS);
  const { applyFilters, config } = usePowerSearchConfig(
    USER_FIELD_DEFS,
    "AdminUsersSearch"
  );

  const rowClickPlugin: TablePlugin<AdminUserRow> = useMemo(
    () => ({
      transformBodyRow: (props, item) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: () => onSelectUser(item),
          style: { ...props.htmlProps.style, cursor: "pointer" },
        },
      }),
    }),
    [onSelectUser]
  );

  const columns = useMemo<TableColumn<AdminUserRow>[]>(
    () => [
      {
        header: m.admin_users_column_name(),
        key: "name",
        renderCell: (row) => (
          <Text maxLines={1} type="body">
            {row.name}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_users_column_email(),
        key: "email",
        renderCell: (row) => (
          <Text color="secondary" maxLines={1} type="supporting">
            {row.email}
          </Text>
        ),
        width: proportional(1),
      },
      {
        header: m.admin_users_column_role(),
        key: "role",
        renderCell: (row) => (
          <Badge
            label={userRoleLabel(row.role)}
            variant={userRoleVariant(row.role)}
          />
        ),
        width: pixel(110),
      },
      {
        header: m.admin_users_column_status(),
        key: "banned",
        renderCell: (row) => (
          <Badge
            label={
              row.banned
                ? m.admin_users_status_banned()
                : m.admin_users_status_active()
            }
            variant={row.banned ? "error" : "success"}
          />
        ),
        width: pixel(110),
      },
      {
        header: m.admin_users_column_created(),
        key: "createdAt",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {formatDate(row.createdAt)}
          </Text>
        ),
        width: pixel(120),
      },
    ],
    []
  );

  const filteredUsers = useMemo(
    () => (users ? applyFilters(filters, users) : []),
    [users, filters, applyFilters]
  );

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
    <VStack gap={4}>
      <PowerSearch
        config={config}
        filters={filters}
        onChange={(newFilters) => setFilters([...newFilters])}
        placeholder={m.admin_users_search_placeholder()}
        popoverSaveButtonLabel={m.apply()}
        resultCount={filteredUsers.length}
      />
      {filteredUsers.length === 0 ? (
        <Center axis="both" style={{ minHeight: 240 }}>
          <EmptyState
            description={m.admin_users_empty_users_description()}
            title={m.admin_users_empty_users_title()}
          />
        </Center>
      ) : (
        <Table<AdminUserRow>
          columns={columns}
          data={filteredUsers}
          density="balanced"
          dividers="rows"
          hasHover
          idKey="id"
          plugins={{ rowClick: rowClickPlugin }}
        />
      )}
    </VStack>
  );
};

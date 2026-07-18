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
import { proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import {
  ACCOUNT_STATUS_OPTIONS,
  accountStatusFromBanned,
  accountStatusLabel,
  accountStatusVariant,
  formatDate,
  USER_ROLE_OPTIONS,
  userRoleLabel,
  userRoleVariant,
} from "../model/format";
import type { AdminUserRow } from "../model/types";

// Extends the row with a derived enum "status" purely for PowerSearch/the
// status column to key off — see the field-defs comment above.
interface AdminUserSearchRow extends AdminUserRow {
  status: ReturnType<typeof accountStatusFromBanned>;
}

// One entry per Better Auth admin-plugin user field this page filters on.
// "status" (not the raw "banned" boolean) — see the doc comment on
// ACCOUNT_STATUS_OPTIONS in model/format.ts for why.
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

  // PowerSearch's field-based filtering wants plain present values, not the
  // raw "banned" boolean — see the doc comment on ACCOUNT_STATUS_OPTIONS in
  // model/format.ts for why this derives a "status" enum instead.
  const rows = useMemo<AdminUserSearchRow[]>(
    () =>
      (users ?? []).map((user) => ({
        ...user,
        status: accountStatusFromBanned(user.banned),
      })),
    [users]
  );

  const rowClickPlugin: TablePlugin<AdminUserSearchRow> = useMemo(
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

  const columns = useMemo<TableColumn<AdminUserSearchRow>[]>(
    () => [
      {
        header: m.admin_users_column_name(),
        key: "name",
        renderCell: (row) => (
          <Text maxLines={1} type="body">
            {row.name}
          </Text>
        ),
        width: proportional(2),
      },
      {
        header: m.admin_users_column_email(),
        key: "email",
        renderCell: (row) => (
          <Text color="secondary" maxLines={1} type="supporting">
            {row.email}
          </Text>
        ),
        width: proportional(2),
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
        width: proportional(1),
      },
      {
        header: m.admin_users_column_status(),
        key: "status",
        renderCell: (row) => (
          <Badge
            label={accountStatusLabel(row.status)}
            variant={accountStatusVariant(row.status)}
          />
        ),
        width: proportional(1),
      },
      {
        header: m.admin_users_column_created(),
        key: "createdAt",
        renderCell: (row) => (
          <Text color="secondary" type="supporting">
            {formatDate(row.createdAt)}
          </Text>
        ),
        width: proportional(1),
      },
    ],
    []
  );

  const filteredUsers = useMemo(
    () => applyFilters(filters, rows),
    [rows, filters, applyFilters]
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
        <Table<AdminUserSearchRow>
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

import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { VStack } from "@astryxdesign/core/Stack";
import type { TableColumn } from "@astryxdesign/core/Table";
import { pixel, proportional, Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import {
  NoSymbolIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";

import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";

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

export const UsersTable = () => {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PowerSearchFilter[]>(DEFAULT_FILTERS);
  const { applyFilters, config } = usePowerSearchConfig(
    USER_FIELD_DEFS,
    "AdminUsersSearch"
  );
  const banAlert = useImperativeAlertDialog();

  const refetch = useCallback(async () => {
    const { data, error: listError } = await authClient.admin.listUsers({
      query: { limit: 200, sortBy: "email" },
    });
    if (listError || !data) {
      setError(listError?.message ?? m.admin_users_error_generic());
      return;
    }
    setError(null);
    setUsers(data.users as unknown as AdminUserRow[]);
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- authClient.admin.listUsers is a plain REST call (no reactive subscription like Convex's useQuery), so an effect-driven fetch-on-mount is the correct tool here, not an anti-pattern to route around.
    refetch();
  }, [refetch]);

  const toggleAdmin = useCallback(
    async (user: AdminUserRow) => {
      await authClient.admin.setRole({
        role: user.role === "admin" ? "user" : "admin",
        userId: user.id,
      });
      await refetch();
    },
    [refetch]
  );

  const confirmBan = useCallback(
    (user: AdminUserRow) => {
      banAlert.show({
        actionLabel: m.admin_users_action_ban(),
        description: m.admin_users_ban_confirm_description({
          email: user.email,
        }),
        onAction: async () => {
          await authClient.admin.banUser({ userId: user.id });
          await refetch();
          banAlert.hide();
        },
        title: m.admin_users_ban_confirm_title(),
      });
    },
    [banAlert, refetch]
  );

  const unban = useCallback(
    async (user: AdminUserRow) => {
      await authClient.admin.unbanUser({ userId: user.id });
      await refetch();
    },
    [refetch]
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
      {
        header: m.admin_field_actions(),
        key: "actions",
        renderCell: (row) => (
          <MoreMenu
            items={[
              {
                icon:
                  row.role === "admin"
                    ? ShieldExclamationIcon
                    : ShieldCheckIcon,
                label:
                  row.role === "admin"
                    ? m.admin_users_action_remove_admin()
                    : m.admin_users_action_make_admin(),
                onClick: () => toggleAdmin(row),
              },
              { type: "divider" as const },
              row.banned
                ? {
                    icon: ShieldCheckIcon,
                    label: m.admin_users_action_unban(),
                    onClick: () => unban(row),
                  }
                : {
                    icon: NoSymbolIcon,
                    label: m.admin_users_action_ban(),
                    onClick: () => confirmBan(row),
                  },
            ]}
            label={m.admin_users_row_actions()}
          />
        ),
        width: pixel(56),
      },
    ],
    [confirmBan, toggleAdmin, unban]
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
        />
      )}
      {banAlert.element}
    </VStack>
  );
};

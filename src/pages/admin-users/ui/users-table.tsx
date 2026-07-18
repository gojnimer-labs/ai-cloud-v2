import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import type { TableColumn } from "@astryxdesign/core/Table";
import {
  pixel,
  proportional,
  resolveColumnWidths,
  Table,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import {
  CheckCircleIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";

import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";

import { formatDate } from "../model/format";

type AdminUserRow = Record<string, unknown> & {
  banned: boolean | null | undefined;
  createdAt: Date | string;
  email: string;
  id: string;
  name: string;
  role: string | null | undefined;
};

export const UsersTable = () => {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    // better-auth's UserWithRole doesn't carry an index signature, which
    // astryx's Table<T> requires (T extends Record<string, unknown>) — this
    // narrows to the fields this table actually reads, same as any other
    // row-shaping cast in this codebase (e.g. FileRow).
    setUsers(data.users as unknown as AdminUserRow[]);
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- authClient.admin.listUsers is a plain REST call (no reactive subscription like Convex's useQuery), so an effect-driven fetch-on-mount is the correct tool here, not an anti-pattern to route around.
    refetch();
  }, [refetch]);

  const toggleAdmin = async (user: AdminUserRow) => {
    await authClient.admin.setRole({
      role: user.role === "admin" ? "user" : "admin",
      userId: user.id,
    });
    await refetch();
  };

  const confirmBan = (user: AdminUserRow) => {
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
  };

  const unban = async (user: AdminUserRow) => {
    await authClient.admin.unbanUser({ userId: user.id });
    await refetch();
  };

  const columns = useMemo<TableColumn<AdminUserRow>[]>(
    () => [
      { header: m.admin_users_column_name(), key: "name", width: pixel(200) },
      {
        header: m.admin_users_column_email(),
        key: "email",
        width: proportional(1),
      },
      { header: m.admin_users_column_role(), key: "role", width: pixel(120) },
      {
        header: m.admin_users_column_status(),
        key: "banned",
        width: pixel(120),
      },
      {
        header: m.admin_users_column_created(),
        key: "createdAt",
        width: pixel(140),
      },
      {
        header: m.admin_field_actions(),
        key: "actions",
        width: pixel(56),
      },
    ],
    []
  );

  const resolvedWidths = resolveColumnWidths(columns);

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

  if (users.length === 0) {
    return (
      <Center axis="both" style={{ minHeight: 240 }}>
        <EmptyState
          description={m.admin_users_empty_users_description()}
          title={m.admin_users_empty_users_title()}
        />
      </Center>
    );
  }

  return (
    <>
      <Table<AdminUserRow>
        columns={columns}
        density="balanced"
        dividers="rows"
        hasHover
        textOverflow="truncate"
      >
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={resolvedWidths.columns.get(column.key)?.style}
            />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow isHeaderRow>
            {columns.map((column) => (
              <TableHeaderCell
                key={column.key}
                style={resolvedWidths.columns.get(column.key)?.style}
              >
                {column.header}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <Text maxLines={1} type="body">
                {user.name}
              </Text>
            </TableCell>
            <TableCell>
              <Text color="secondary" type="supporting">
                {user.email}
              </Text>
            </TableCell>
            <TableCell>
              <Badge
                label={
                  user.role === "admin"
                    ? m.admin_users_role_admin()
                    : m.admin_users_role_user()
                }
                variant={user.role === "admin" ? "purple" : "neutral"}
              />
            </TableCell>
            <TableCell>
              <Badge
                label={
                  user.banned
                    ? m.admin_users_status_banned()
                    : m.admin_users_status_active()
                }
                variant={user.banned ? "error" : "success"}
              />
            </TableCell>
            <TableCell>
              <Text color="secondary" type="supporting">
                {formatDate(user.createdAt)}
              </Text>
            </TableCell>
            <TableCell>
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
                    onClick: () => toggleAdmin(user),
                  },
                  { type: "divider" as const },
                  user.banned
                    ? {
                        icon: CheckCircleIcon,
                        label: m.admin_users_action_unban(),
                        onClick: () => unban(user),
                      }
                    : {
                        icon: NoSymbolIcon,
                        label: m.admin_users_action_ban(),
                        onClick: () => confirmBan(user),
                      },
                ]}
                label={m.admin_users_row_actions()}
              />
            </TableCell>
          </TableRow>
        ))}
      </Table>
      {banAlert.element}
    </>
  );
};

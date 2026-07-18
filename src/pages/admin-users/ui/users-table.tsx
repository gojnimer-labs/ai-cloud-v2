import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import {
  NoSymbolIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";

import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";

interface AdminUserRow {
  banned: boolean | null | undefined;
  createdAt: Date | string;
  email: string;
  id: string;
  name: string;
  role: string | null | undefined;
}

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

  // Banned users are hidden by default — no filter UI, this is the only view.
  const visibleUsers = users.filter((user) => !user.banned);

  if (visibleUsers.length === 0) {
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
      <List density="compact" hasDividers>
        {visibleUsers.map((user) => (
          <ListItem
            description={user.email}
            endContent={
              <HStack gap={2} vAlign="center">
                <Badge
                  label={
                    user.role === "admin"
                      ? m.admin_users_role_admin()
                      : m.admin_users_role_user()
                  }
                  variant={user.role === "admin" ? "purple" : "neutral"}
                />
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
                    {
                      icon: NoSymbolIcon,
                      label: m.admin_users_action_ban(),
                      onClick: () => confirmBan(user),
                    },
                  ]}
                  label={m.admin_users_row_actions()}
                  size="sm"
                />
              </HStack>
            }
            key={user.id}
            label={user.name}
          />
        ))}
      </List>
      {banAlert.element}
    </>
  );
};

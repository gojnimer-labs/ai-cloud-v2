import { useImperativeAlertDialog } from "@astryxdesign/core/AlertDialog";
import { useCallback, useEffect, useState } from "react";

import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";

import type { AdminUserRow } from "./types";

// Owns the user roster + row actions in one place so both the table (which
// renders rows and wires row-click selection) and the detail side panel
// (which renders the same actions in its header MoreMenu, per the
// admin-clusters row-click-opens-panel pattern) share one data source
// instead of each fetching/mutating independently.
export const useAdminUsers = () => {
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
      const baseOptions = {
        actionLabel: m.admin_users_action_ban(),
        description: m.admin_users_ban_confirm_description({
          email: user.email,
        }),
        title: m.admin_users_ban_confirm_title(),
      };
      const onAction = async () => {
        // Disables the action button for the duration of the request —
        // without this, a fast double-click fires onAction twice before
        // the first request resolves.
        // oxlint-disable-next-line react/react-compiler -- onAction refers to itself so a retry click after a failure reuses the same handler; the compiler can't prove this self-reference is stable, but it's a plain local closure re-shown via the imperative alert API, not reactive state it should track.
        banAlert.show({ ...baseOptions, isActionLoading: true, onAction });
        try {
          await authClient.admin.banUser({ userId: user.id });
          await refetch();
          banAlert.hide();
        } catch (banError) {
          // Re-enables the action button for a retry, then rethrows —
          // same lack-of-toast behavior as before this fix, just no longer
          // leaving the button stuck in its loading state on failure.
          banAlert.show({ ...baseOptions, isActionLoading: false, onAction });
          throw banError;
        }
      };
      banAlert.show({ ...baseOptions, onAction });
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

  return {
    banAlertElement: banAlert.element,
    confirmBan,
    error,
    toggleAdmin,
    unban,
    users,
  };
};

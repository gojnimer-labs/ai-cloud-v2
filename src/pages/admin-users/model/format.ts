import { m } from "@/paraglide/messages";

import type { UserRole } from "./types";

export const formatDate = (value: number | string | Date): string =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const userRoleLabel = (role: UserRole): string =>
  role === "admin" ? m.admin_users_role_admin() : m.admin_users_role_user();

export const userRoleVariant = (role: UserRole): "purple" | "neutral" =>
  role === "admin" ? "purple" : "neutral";

// Localized options for the PowerSearch "role" enum filter — see
// admin-clusters/model/format.ts#WORKLOAD_STATUS_OPTIONS for the same
// pattern applied to a backend-defined enum.
export const USER_ROLE_OPTIONS: { label: string; value: UserRole }[] = (
  ["admin", "user"] as const
).map((role) => ({ label: userRoleLabel(role), value: role }));

export type AccountStatus = "active" | "banned";

export const accountStatusFromBanned = (
  banned: boolean | null | undefined
): AccountStatus => (banned ? "banned" : "active");

export const accountStatusLabel = (status: AccountStatus): string =>
  status === "banned"
    ? m.admin_users_status_banned()
    : m.admin_users_status_active();

export const accountStatusVariant = (
  status: AccountStatus
): "error" | "success" => (status === "banned" ? "error" : "success");

// A PowerSearch enum field, not the raw `banned` boolean this derives from:
// the package's boolean field type only offers "is true" / "is false" as
// operator labels (see node_modules/@astryxdesign/core/dist/PowerSearch/
// usePowerSearchConfig.js#booleanOperators), which read as a nonsensical
// "Status is false" chip with no way to relabel them. An enum gets real
// operator labels ("is"/"is not") over friendly values instead.
export const ACCOUNT_STATUS_OPTIONS: { label: string; value: AccountStatus }[] =
  (["active", "banned"] as const).map((status) => ({
    label: accountStatusLabel(status),
    value: status,
  }));

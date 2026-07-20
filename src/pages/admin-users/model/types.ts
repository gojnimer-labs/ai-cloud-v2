import type { Id } from "@convex/_generated/dataModel";

export type UserRole = "user" | "admin";

export interface AdminUserRow extends Record<string, unknown> {
  banned: boolean;
  createdAt: number;
  email: string;
  id: string;
  name: string;
  role: UserRole;
}

export type AccountStatus = "active" | "banned";

export type UsersGroupByField = "none" | "group";

// Mirrors admin-groups' own GroupBadgeColor but kept local here rather than
// imported cross-page (see admin-clusters/admin-invites for the same
// page-slice-independence convention).
export type GroupBadgeColor =
  | "blue"
  | "cyan"
  | "green"
  | "orange"
  | "pink"
  | "purple"
  | "red"
  | "teal"
  | "yellow";

// A group, as far as the Users page needs to know about it — mirrors
// admin-groups' own GroupRow but kept local here rather than imported
// cross-page (see admin-clusters/admin-invites for the same
// page-slice-independence convention).
export interface UserGroupOption {
  _id: Id<"groups">;
  badgeColor: GroupBadgeColor;
  name: string;
}

// AdminUserRow (Better Auth REST data) enriched with the derived "status"
// enum PowerSearch filters on (see model/format.ts's ACCOUNT_STATUS_OPTIONS
// doc comment) and this user's group memberships (Convex data, joined in by
// userId at the page level — see users-page.tsx) — the shape both the page
// and UsersTable operate on once assembled. groupBadgeColors is parallel to
// groupNames (same order/length), not a separate lookup.
export interface AdminUserTableRow extends AdminUserRow {
  groupBadgeColors: GroupBadgeColor[];
  groupIds: Id<"groups">[];
  groupNames: string[];
  status: AccountStatus;
}

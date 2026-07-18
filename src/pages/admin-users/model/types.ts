export type InviteStatus =
  | "pending"
  | "rejected"
  | "canceled"
  | "used"
  | "expired";

export type InviteRole = "user" | "admin";

export interface InviteRow extends Record<string, unknown> {
  createdAt: number;
  createdByEmail: string;
  email: string;
  expiresAt: number;
  role: InviteRole;
  status: InviteStatus;
  token: string;
}

export interface AdminUserRow extends Record<string, unknown> {
  banned: boolean;
  createdAt: number;
  email: string;
  id: string;
  name: string;
  role: InviteRole;
}

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
  groupIds: string[];
  role: InviteRole;
  status: InviteStatus;
  token: string;
}

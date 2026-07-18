export type InviteStatus =
  | "pending"
  | "rejected"
  | "canceled"
  | "used"
  | "expired";

export interface InviteRow extends Record<string, unknown> {
  createdAt: number;
  createdByEmail?: string;
  expiresAt: number;
  role: string;
  status: InviteStatus;
  token: string;
}

export type InviteRole = "user" | "admin";

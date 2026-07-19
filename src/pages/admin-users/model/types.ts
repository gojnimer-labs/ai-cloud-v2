export type UserRole = "user" | "admin";

export interface AdminUserRow extends Record<string, unknown> {
  banned: boolean;
  createdAt: number;
  email: string;
  id: string;
  name: string;
  role: UserRole;
}

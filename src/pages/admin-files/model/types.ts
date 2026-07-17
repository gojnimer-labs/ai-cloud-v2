import type { Id } from "@convex/_generated/dataModel";

export interface FileRow extends Record<string, unknown> {
  _id: Id<"files">;
  createdAt: number;
  group: string;
  label: string;
  r2Bucket: string;
  r2Key: string;
  type: string;
  userEmail: string;
  userId: string;
}

export interface FileFormState {
  group: string;
  label: string;
  r2Bucket: string;
  r2Key: string;
  type: string;
  userId: string;
}

export type FileFormMode =
  | { kind: "create" }
  | { kind: "edit"; fileId: Id<"files"> };

import { createApi } from "@convex-dev/better-auth";

import { createAuthOptions } from "../auth";
import schema from "./schema";

const api = createApi(schema, createAuthOptions);

export const { create, findOne, findMany } = api;
// TS composite/declaration-emit (tsc -b) can't name the internal
// TableNames type from @convex-dev/better-auth's generated component
// types (TS2883) for these four. They're only consumed by the Better
// Auth component wiring itself.
// oxlint-disable typescript/no-explicit-any -- see comment above
export const {
  deleteMany,
  deleteOne,
  updateMany,
  updateOne,
}: {
  deleteMany: any;
  deleteOne: any;
  updateMany: any;
  updateOne: any;
} = api;
// oxlint-enable typescript/no-explicit-any

import { createApi } from "@convex-dev/better-auth";
import { createAuthOptions } from "../auth";
import schema from "./schema";

const api = createApi(schema, createAuthOptions);

export const { create, findOne, findMany } = api;
// TS composite/declaration-emit (tsc -b) can't name the internal
// TableNames type from @convex-dev/better-auth's generated component
// types (TS2883) for these four. They're only consumed by the Better
// Auth component wiring itself.
// biome-ignore lint/suspicious/noExplicitAny: see comment above
export const updateOne: any = api.updateOne;
// biome-ignore lint/suspicious/noExplicitAny: see comment above
export const updateMany: any = api.updateMany;
// biome-ignore lint/suspicious/noExplicitAny: see comment above
export const deleteOne: any = api.deleteOne;
// biome-ignore lint/suspicious/noExplicitAny: see comment above
export const deleteMany: any = api.deleteMany;

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type {
  RowDirectiveContext,
  RowDirectiveTarget,
} from "../rowDirectives/types";
import type { SelectOptionPayload } from "./validators";

interface SelectOptionsInsertFields {
  handler: string;
  label: string;
  sourceKey: string;
}
interface SelectOptionsUpdateFields {
  label: string;
}

// Adapter between the opaque row-directive fields (see
// convex/rowDirectives/registry.ts) and selectOptions/mutations.ts's own
// typed, table-owned mutations — those mutations have no awareness this
// generic directive system exists. A malformed `fields` object surfaces as
// a normal Convex argument-validation error from the ctx.runMutation calls
// below, not a silent failure.
export const selectOptionsRowDirectiveTarget: RowDirectiveTarget = {
  create: async (
    ctx,
    fields,
    { resolvePrepared, userId }: RowDirectiveContext
  ) => {
    const f = fields as SelectOptionsInsertFields;
    const payload = resolvePrepared(f.handler) as
      | SelectOptionPayload
      | undefined;
    if (!payload) {
      throw new Error(
        `selectOptions insert_row for handler "${f.handler}" with no prepared upload data available`
      );
    }
    await ctx.runMutation(internal.selectOptions.mutations.create, {
      createdAt: Date.now(),
      label: f.label,
      payload,
      sourceKey: f.sourceKey,
      updatedAt: Date.now(),
      userId,
    });
  },
  patch: async (ctx, rowId, fields, { userId }: RowDirectiveContext) => {
    const f = fields as SelectOptionsUpdateFields;
    await ctx.runMutation(internal.selectOptions.mutations.patch, {
      id: rowId as Id<"selectOptions">,
      label: f.label,
      userId,
    });
  },
  remove: async (ctx, rowId, { userId }: RowDirectiveContext) => {
    await ctx.runMutation(internal.selectOptions.mutations.remove, {
      id: rowId as Id<"selectOptions">,
      userId,
    });
  },
};

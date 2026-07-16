import type { TableNames } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { selectOptionsRowDirectiveTarget } from "../selectOptions/rowDirectiveTarget";
import type { RowDirectiveContext, RowDirectiveTarget } from "./types";

// Every table an insert_row/update_row/remove_row directive can target.
// Partial<Record<TableNames, ...>> catches a typo'd key at compile time —
// not every table needs (or should have) a target; only ones explicitly
// opted in here are reachable through this system at all. `table` in a
// directive is this registry's key, never a literal Convex table name
// handed to ctx.db directly.
const TARGETS: Partial<Record<TableNames, RowDirectiveTarget>> = {
  selectOptions: selectOptionsRowDirectiveTarget,
};

const getTarget = (table: string): RowDirectiveTarget => {
  const target = TARGETS[table as TableNames];
  if (!target) {
    throw new Error(`Unknown row-directive table: ${table}`);
  }
  return target;
};

export const createRow = (
  ctx: ActionCtx,
  table: string,
  fields: unknown,
  context: RowDirectiveContext
): Promise<void> => getTarget(table).create(ctx, fields, context);

export const patchRow = (
  ctx: ActionCtx,
  table: string,
  rowId: string,
  fields: unknown,
  context: RowDirectiveContext
): Promise<void> => getTarget(table).patch(ctx, rowId, fields, context);

export const removeRow = (
  ctx: ActionCtx,
  table: string,
  rowId: string,
  context: RowDirectiveContext
): Promise<void> => getTarget(table).remove(ctx, rowId, context);

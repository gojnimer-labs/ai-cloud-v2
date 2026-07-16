import type { ActionCtx } from "../_generated/server";

// Context every target's create/patch/remove receives, regardless of
// which table it targets.
export interface RowDirectiveContext {
  // Looks up data Convex prepared before calling the operator (see
  // selectOptions/handlers.ts#prepareSelectOptionUpload), keyed by the
  // same handler name a target's own fields might reference. Most targets
  // won't need this — only ones backing a file/upload-direction parameter
  // do.
  resolvePrepared: (handler: string) => unknown;
  userId: string;
}

export interface RowDirectiveTarget {
  create: (
    ctx: ActionCtx,
    fields: unknown,
    context: RowDirectiveContext
  ) => Promise<void>;
  patch: (
    ctx: ActionCtx,
    rowId: string,
    fields: unknown,
    context: RowDirectiveContext
  ) => Promise<void>;
  remove: (
    ctx: ActionCtx,
    rowId: string,
    context: RowDirectiveContext
  ) => Promise<void>;
}

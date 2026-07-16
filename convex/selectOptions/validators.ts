import { v } from "convex/values";

// One variant per named handler in handlers.ts — adding a new dynamic-select
// source that needs its own resolved-value logic means adding a variant
// here and a matching case in handlers.ts's resolveSelectOption, nothing
// else. A discriminated union (rather than an opaque `v.any()` blob plus a
// separate string discriminator) ties each handler name to its exact
// expected shape at the validator level — see convex/_generated/ai/
// guidelines.md's schema-with-discriminated-union example, the same
// pattern applied here.
export const selectOptionPayloadValidator = v.union(
  v.object({
    handler: v.literal("r2_helper"),
    r2Bucket: v.string(),
    r2Key: v.string(),
  })
);

export type SelectOptionPayload = typeof selectOptionPayloadValidator.type;

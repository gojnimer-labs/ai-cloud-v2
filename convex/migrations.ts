import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

// Per the convex-migration-helper skill's "small table shortcut": the
// `@convex-dev/migrations` component isn't installed in this app, and the
// `workloads` table is small enough (dev-only, no production traffic — see
// git history) that a single internalMutation is the right tool rather than
// the full component.
//
// This repo has no real pre-existing data worth a two-deploy widen/migrate/
// narrow rollout, so schema.ts's status/desiredOperatorTags/displayName
// widening landed as REQUIRED fields in the same PR as this migration
// (rather than shipping them optional first, backfilling, then narrowing in
// a second deploy). That means this migration is a no-op against this
// repo's actual data today — Convex would already reject any row missing a
// required field before this function ever runs. It exists to establish the
// pattern (and the `"field" in doc` runtime guard, which works regardless
// of what the schema currently requires) for the next time this table needs
// a genuinely breaking change against real data, where the widen step would
// come first.
//
// `"status" in doc` (rather than `doc.status === undefined`) is used
// deliberately: since the schema now types `status` as always-present, both
// a direct `undefined` comparison AND a plain `"status" in doc` narrowing
// would have TypeScript treat the "missing" branch as unreachable (`never`)
// — hence the `Record<string, unknown>` cast below, which sidesteps that
// narrowing while still checking real property existence at runtime (Convex
// omits absent optional fields entirely rather than storing an explicit
// `undefined`, so this still correctly detects a genuinely legacy row).
export const backfillWorkloadStatuses = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Bounded per the guidelines (`.take()`, not `.collect()`), mirroring
    // operators/mutations.ts#promoteHealthStatuses's own cap for a
    // similarly small table. Re-run the mutation if a table ever grows
    // past this in a single backfill pass.
    const docs = await ctx.db.query("workloads").take(500);
    // Mirrors operators/mutations.ts#promoteHealthStatuses's flatMap +
    // Promise.all shape — builds every patch first, then applies them
    // concurrently, rather than awaiting each one sequentially in a loop.
    const patches = docs.flatMap((doc) => {
      const raw = doc as unknown as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (!("status" in raw)) {
        patch.status = "active";
      }
      if (!("desiredOperatorTags" in raw)) {
        patch.desiredOperatorTags = [];
      }
      if (!("displayName" in raw)) {
        // The only human-facing identity that existed before this change.
        patch.displayName =
          (raw.name as string | undefined) ?? `workload-${doc._id}`;
      }
      if (Object.keys(patch).length === 0) {
        return [];
      }
      return [ctx.db.patch(doc._id, patch)];
    });
    await Promise.all(patches);
    return patches.length;
  },
  returns: v.number(),
});

// Verification query per the plan: run before shipping any future Deploy-2
// narrowing, to confirm the backfill above actually reached every row.
export const countUnmigratedWorkloads = internalQuery({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("workloads").take(500);
    return docs.filter(
      (doc) => !("status" in (doc as unknown as Record<string, unknown>))
    ).length;
  },
  returns: v.number(),
});

import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

// One-off backfill for the data -> payload migration (see the doc comment
// on convex/schema.ts#selectOptions). Run once via
// `npx convex run selectOptions/migrations:backfillPayload` after deploying
// the widened schema (payload optional, data still present); every existing
// row today is a profiles_firefox/profiles_chrome backup with exactly the
// `{ r2Bucket, r2Key }` data shape handled below. Once every row has a
// payload, delete this file and narrow schema.ts: drop `data`, make
// `payload` required.
export const backfillPayload = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("selectOptions").collect();
    const results = await Promise.all(
      rows.map(async (row) => {
        if (row.payload || !row.data) {
          return false;
        }
        const { r2Bucket, r2Key } = row.data as {
          r2Bucket?: unknown;
          r2Key?: unknown;
        };
        if (typeof r2Bucket !== "string" || typeof r2Key !== "string") {
          return false;
        }
        await ctx.db.patch(row._id, {
          payload: { handler: "r2_helper", r2Bucket, r2Key },
        });
        return true;
      })
    );
    return results.filter(Boolean).length;
  },
  returns: v.number(),
});

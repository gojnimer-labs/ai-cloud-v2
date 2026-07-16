import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { selectOptionPayloadValidator } from "./selectOptions/validators";

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  // One-time gateway access tokens (see convex/gateway/mutations.ts and
  // ai-cloud-operator's requireGatewayToken). tokenHash is a SHA-256 digest
  // (never the raw token, same pattern as operators.heartbeatTokenHash) —
  // Convex is the only party that can enforce true single-use, so the
  // operator always calls back here to verify+consume rather than checking
  // anything locally. usedAt set means already consumed; expiresAt bounds
  // how long an unused token stays valid regardless.
  gatewayTokens: defineTable({
    expiresAt: v.number(),
    name: v.string(),
    namespace: v.string(),
    tokenHash: v.string(),
    usedAt: v.optional(v.number()),
    userId: v.string(),
  }).index("by_token_hash", ["tokenHash"]),
  messages: defineTable({
    author: v.string(),
    body: v.string(),
  }),

  // One row per cluster. Admins pre-create a row (via the admin Clusters
  // page) before any real operator instance exists, minting a unique
  // enrollmentTokenHash for it; the operator claims the row by presenting
  // that secret to POST /operators/register, at which point claimedAt/
  // externalUrl/deployToken/heartbeatTokenHash get filled in. name/
  // description/region/tags/retentionPolicy are admin-owned metadata and are
  // never touched by the operator's own register payload — trusting a
  // caller-supplied identity there was the actual gap in the old
  // single-shared-secret design (anyone holding the secret could claim or
  // rename any cluster). heartbeatTokenHash is a SHA-256 digest (never the
  // raw token) presented BY the operator on heartbeat calls; deployToken is
  // raw and presented BY Convex when calling the operator's own inbound HTTP
  // API — see convex/operators/http.ts for why the two tokens can't be
  // collapsed into one.
  operators: defineTable({
    claimedAt: v.optional(v.number()),
    deployToken: v.optional(v.string()),
    description: v.optional(v.string()),
    enrollmentTokenHash: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    healthStatus: v.union(
      v.literal("pending"),
      v.literal("healthy"),
      v.literal("offline"),
      v.literal("ready_to_destroy")
    ),
    heartbeatTokenHash: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    name: v.string(),
    region: v.optional(v.string()),
    registeredAt: v.number(),
    retentionPolicy: v.union(v.literal("standard"), v.literal("retain")),
    tags: v.optional(v.array(v.string())),
  })
    .index("by_name", ["name"])
    .index("by_heartbeatTokenHash", ["heartbeatTokenHash"])
    .index("by_enrollmentTokenHash", ["enrollmentTokenHash"]),

  // Generic backing store for any catalog parameter whose dataSource.kind is
  // "dynamic" (see catalog.Parameter in ai-cloud-operator, and
  // operators/actions.ts#getCatalog which resolves the pattern). One table
  // serves every dynamic-select source instead of a bespoke table per
  // feature: today sourceKeys "profiles_firefox"/"profiles_chrome" back each
  // browser template's own profile-restore dropdown (split from a single
  // shared "profiles_browser" key so a Firefox backup can't show up as a
  // Chrome restore option, since the tarball layouts aren't compatible); a
  // future source (e.g. "ssh_keys") just needs rows with a new sourceKey, no
  // schema change.
  //
  // `payload` carries whatever source-specific data the consumer of the
  // chosen value needs to resolve it back into something usable (e.g.
  // { handler: "r2_helper", r2Bucket, r2Key } for profiles_firefox/
  // profiles_chrome, read back via selectOptions/handlers.ts#
  // resolveSelectOption in workloads/actions.ts#deployWorkload) — a
  // discriminated union keyed by `handler`, see selectOptions/validators.ts.
  // The row's own `_id` IS the parameter's value (see
  // operators/actions.ts#resolveDynamicOptions) —
  // there's no separate opaque value field to keep in sync with it.
  //
  // `data` is the deprecated predecessor of `payload` (an untyped
  // `{r2Bucket, r2Key}` blob with no handler tag) — kept only until
  // selectOptions/migrations.ts#backfillPayload has run against every
  // existing row, at which point both `data` and the migration function get
  // deleted and `payload` becomes required.
  //
  // Scoped by user: listBySource/get (see selectOptions/queries.ts) both
  // require and filter by userId, so one user's saved options are never
  // resolvable or restorable by another user.
  selectOptions: defineTable({
    createdAt: v.number(),
    data: v.optional(v.any()),
    label: v.string(),
    payload: v.optional(selectOptionPayloadValidator),
    sourceKey: v.string(),
    updatedAt: v.number(),
    // authComponent user._id
    userId: v.string(),
  }).index("by_source_and_user", ["sourceKey", "userId"]),

  // Ownership-only record of a workload deployed through an operator.
  // Deliberately has NO status field: the operator's Workload custom
  // resource is the sole source of truth for runtime state, fetched live on
  // demand (see workloads/actions.ts#listMyWorkloads). Mirroring status here
  // would recreate the v1 statusSync.ts/syncLocks drift problem this
  // architecture exists to avoid.
  workloads: defineTable({
    createdAt: v.number(),
    name: v.string(),
    namespace: v.string(),
    operatorId: v.id("operators"),
    subdomain: v.optional(v.string()),
    // catalog template id, e.g. "nginx"/"firefox"/"chrome"
    templateId: v.string(),
    // authComponent user._id
    userId: v.string(),
  })
    .index("by_operator_and_name", ["operatorId", "name"])
    .index("by_user", ["userId"]),
});

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

  // One row per registered ai-cloud-operator instance. heartbeatTokenHash is
  // a SHA-256 digest (never the raw token) presented BY the operator on
  // heartbeat calls; deployToken is raw and presented BY Convex when calling
  // the operator's own inbound HTTP API — see convex/operators/http.ts for
  // why the two tokens can't be collapsed into one.
  operators: defineTable({
    deployToken: v.string(),
    externalUrl: v.string(),
    heartbeatTokenHash: v.string(),
    lastHeartbeatAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    name: v.string(),
    registeredAt: v.number(),
    status: v.union(v.literal("active"), v.literal("unreachable")),
  })
    .index("by_name", ["name"])
    .index("by_heartbeatTokenHash", ["heartbeatTokenHash"]),

  // Generic backing store for any catalog parameter whose type is
  // "select_<sourceKey>" (see catalog.Parameter in ai-cloud-operator, and
  // operators/actions.ts#getCatalog which resolves the pattern). One table
  // serves every dynamic-select source instead of a bespoke table per
  // feature: today sourceKey "profiles_browser" backs the firefox/chrome
  // profile-restore dropdown; a future source (e.g. "ssh_keys") just needs
  // rows with a new sourceKey, no schema change.
  //
  // `data` carries whatever source-specific payload the consumer of the
  // chosen value needs (e.g. { r2Bucket, r2Key } for profiles_browser, read
  // back in workloads/actions.ts#deployWorkload). The row's own `_id` IS the
  // parameter's value (see operators/actions.ts#resolveDynamicOptions) —
  // there's no separate opaque value field to keep in sync with it.
  //
  // Not filtered by user when listing (see selectOptions/queries.ts) — a
  // POC-stage simplification, not a permanent design choice.
  selectOptions: defineTable({
    createdAt: v.number(),
    data: v.optional(v.any()),
    label: v.string(),
    sourceKey: v.string(),
    updatedAt: v.number(),
    userId: v.optional(v.string()), // authComponent user._id, when scoped
  }).index("by_source", ["sourceKey"]),

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
    templateId: v.string(), // catalog template id, e.g. "nginx"/"firefox"/"chrome"
    userId: v.string(), // authComponent user._id
  })
    .index("by_operator_and_name", ["operatorId", "name"])
    .index("by_user", ["userId"]),
});

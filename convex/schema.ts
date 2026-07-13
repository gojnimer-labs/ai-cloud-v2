import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
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

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  // A file Convex knows about — currently only R2-backed browser profile
  // backups (see catalog.FileResult in ai-cloud-operator and
  // workloads/actions.ts#runOperation, which creates a row here whenever an
  // operator call reports one), but deliberately not scoped to that one
  // case: `group`/`type` are free-form so a future kind of file (an SSH
  // key export, a log bundle, ...) just needs rows with a new group/type,
  // no schema change.
  //
  // `group` is which files/select-of-files dropdown this belongs to — e.g.
  // "profiles_firefox"/"profiles_chrome" (split so a Firefox backup can't
  // show up as a Chrome restore option, since the tarball layouts aren't
  // compatible) — matching a catalog.DataSourceFileOptions parameter's
  // Group (see operators/actions.ts#resolveFileOptions) and a
  // catalog.DataSourceFile upload parameter's Group (see
  // workloads/actions.ts#runOperation). `type` is a finer-grained kind tag
  // (e.g. "browser_profile_backup") for future filtering/display, not used
  // for any resolution logic today.
  //
  // Only `r2Bucket`/`r2Key` are stored here — actual object metadata
  // (size, contentType, lastModified) lives in the R2 component's own
  // metadata store, synced via storage/r2.ts's `r2.syncMetadata` right
  // after a successful upload and read back via `r2.getMetadata`, so it's
  // never duplicated here.
  //
  // Scoped by user: listByGroup/get (see files/queries.ts) both require
  // and filter by userId, so one user's files are never resolvable or
  // restorable by another user.
  files: defineTable({
    createdAt: v.number(),
    group: v.string(),
    label: v.string(),
    r2Bucket: v.string(),
    r2Key: v.string(),
    type: v.string(),
    // authComponent user._id
    userId: v.string(),
  }).index("by_user_and_group", ["userId", "group"]),

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
  // feature — no current consumer (browser profile backups moved to the
  // `files` table above, since a file's identity is more than just a
  // label), kept as the generic bridge for a future non-file dynamic
  // source (e.g. "ssh_keys" as a plain list of named strings): just needs
  // rows with a new sourceKey, no schema change. The row's own `_id` IS
  // the parameter's value (see operators/actions.ts#resolveDynamicOptions)
  // — there's no separate opaque value field to keep in sync with it.
  //
  // Scoped by user: listBySource/get (see selectOptions/queries.ts) both
  // require and filter by userId, so one user's saved options are never
  // resolvable or restorable by another user.
  selectOptions: defineTable({
    createdAt: v.number(),
    label: v.string(),
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

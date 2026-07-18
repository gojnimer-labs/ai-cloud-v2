import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Shared across workloads/mutations.ts, workloads/queries.ts, and
// operators/http.ts — every one of the ~10 request-lifecycle states above
// needs to stay in exact sync between the table's own validator and every
// function that accepts/returns a status, so this is exported rather than
// duplicated the way operators.healthStatus's much-smaller (3-value) union
// is inlined at each of its two call sites.
export const workloadStatusValidator = v.union(
  // Brand-new workload, not yet assigned to an operator (tag-matched,
  // competitive claim).
  v.literal("requested"),
  v.literal("provisioning"),
  v.literal("active"),
  // Operations on an already-assigned workload (operatorId fixed, no tag
  // matching — just that operator noticing its own pending work on
  // heartbeat).
  v.literal("requested_destroy"),
  v.literal("destroying"),
  v.literal("requested_redeploy"),
  v.literal("redeploying"),
  // Pause without destroying (scale the Deployment to 0 replicas, keep the
  // CR/Service in place) — the ban-flow primitive: `active -> requested_stop
  // -> stopping -> stopped`, and back via `stopped -> requested_resume ->
  // resuming -> active`. See reportLifecycle for how a stopping/resuming
  // failure falls back (never to terminal `failed` — the CR is still alive
  // either way).
  v.literal("requested_stop"),
  v.literal("stopping"),
  v.literal("stopped"),
  v.literal("requested_resume"),
  v.literal("resuming"),
  // Terminal for a create or redeploy attempt that didn't succeed
  // (failureReason populated).
  v.literal("failed"),
  // Terminal, soft-delete (row kept for history/audit).
  v.literal("destroyed"),
  // Unused by any mutation today — reserved so a future drift-detection/
  // sync job can flag a CR that exists with no live row, or vice versa.
  v.literal("orphaned")
);

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

  // A workload's request-lifecycle state (`status`) plus, once assigned,
  // its ownership record. This used to deliberately have NO status field —
  // the operator's Workload custom resource was the sole source of runtime
  // state, fetched live on demand. That still holds for the CR's own
  // runtime `Phase` (readyReplicas, etc. — see workloads/actions.ts#
  // listMyWorkloads), but create/destroy/redeploy are now a desired-state/
  // reconciliation flow (see the architecture plan's "Unified status
  // model"), so `status` here tracks *that* request lifecycle
  // (requested -> provisioning -> active, etc.), a distinct concern from
  // the CR's Phase.
  //
  // `name`/`namespace`/`operatorId` are optional because a brand-new
  // `requested` row has none of them yet — `name` in particular is no
  // longer minted by Convex at all (the cluster's `GenerateName` remains
  // the sole source of the real Kubernetes name); it gets filled in later
  // by the create-time upsert callback (`record`), once the owning
  // operator has actually created the resource. `displayName` is the
  // permanent human-facing identity shown everywhere in the UI, unique per
  // user (`by_user_and_display_name`) — set at request time and never
  // touched by the k8s-name-bearing callback.
  workloads: defineTable({
    // "Config to apply" for a pending create/redeploy, and "last-applied
    // config" for display/redeploy-prefill once active. Backfilled
    // pre-existing rows (see migrations.ts) never pass through claim and so
    // never need one.
    config: v.optional(v.any()),
    createdAt: v.number(),
    // Tags an operator must ALL have to claim this workload (create only;
    // destroy/redeploy already have a fixed operatorId and never consult
    // this). Empty array matches any operator.
    desiredOperatorTags: v.array(v.string()),
    // Human-facing identity, shown everywhere in the UI. Unique per user.
    displayName: v.string(),
    // Populated only when status is "failed".
    failureReason: v.optional(v.string()),
    name: v.optional(v.string()),
    namespace: v.optional(v.string()),
    operatorId: v.optional(v.id("operators")),
    status: workloadStatusValidator,
    subdomain: v.optional(v.string()),
    // catalog template id, e.g. "nginx"/"firefox"/"chrome"
    templateId: v.string(),
    // The catalog template's manually-bumped Version string, captured at
    // request time (create or redeploy) and compared by the acting
    // operator against its own catalog before it builds/patches anything —
    // guards against a template changing shape between request and claim.
    // Never needed for legacy/backfilled rows, which go straight to
    // "active" without passing through claim.
    templateVersion: v.optional(v.string()),
    // authComponent user._id
    userId: v.string(),
  })
    .index("by_operator_and_name", ["operatorId", "name"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_operator_and_status", ["operatorId", "status"])
    .index("by_user_and_display_name", ["userId", "displayName"]),
});

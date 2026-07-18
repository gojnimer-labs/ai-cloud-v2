import { v } from "convex/values";

import { authComponent, createAuthOptions } from "../auth";
import { adminQuery } from "../functions";
import { workloadStatusValidator } from "../schema";

const clusterWorkloadValidator = v.object({
  _id: v.id("workloads"),
  createdAt: v.number(),
  // "Config to apply"/"last-applied config" (see convex/schema.ts's doc
  // comment on workloads.config) — surfaced so the Fleet detail panel can
  // pre-fill a redeploy form the same way the owner's own Workloads page
  // does, via convex/admin/actions.ts#adminRequestRedeploy.
  config: v.optional(v.any()),
  // The human-facing identity, always present; the real k8s name/namespace
  // are optional support-facing details that don't exist yet for a
  // requested/provisioning row (see convex/schema.ts).
  displayName: v.string(),
  // Populated only when status is "failed", or on an "active" row that
  // recovered from a failed redeploy/create report (see
  // workloads/mutations.ts#reportLifecycle) — surfaced to admins for
  // debugging, not shown at all when absent.
  failureReason: v.optional(v.string()),
  name: v.optional(v.string()),
  namespace: v.optional(v.string()),
  status: workloadStatusValidator,
  templateId: v.string(),
  userEmail: v.string(),
});

const adminFileValidator = v.object({
  _id: v.id("files"),
  createdAt: v.number(),
  group: v.string(),
  label: v.string(),
  r2Bucket: v.string(),
  r2Key: v.string(),
  type: v.string(),
  userEmail: v.string(),
  userId: v.string(),
});

// Admin-only fleet overview: every cluster (operator) with its workloads,
// owner emails resolved from the Better Auth user table. Bounded rather than
// paginated — this is a fleet overview, not something meant to scroll
// through thousands of rows.
//
// `unclaimedWorkloads` is a separate list, not folded into any operator's
// `workloads`: a freshly `requested` row has no `operatorId` yet (see
// convex/schema.ts) until some operator claims it, so it can't be grouped
// under any real cluster — without this, such rows were simply invisible on
// this page (they only ever showed up on the requesting user's own
// workloads page, which lists by userId, not operatorId).
export const listClusters = adminQuery({
  args: {},
  handler: async (ctx) => {
    const operators = await ctx.db.query("operators").take(200);
    const workloads = await ctx.db.query("workloads").take(1000);

    const userIds = [...new Set(workloads.map((workload) => workload.userId))];
    const users = await Promise.all(
      userIds.map((userId) => authComponent.getAnyUserById(ctx, userId))
    );
    const emailByUserId = new Map(
      userIds.map((userId, index) => [userId, users[index]?.email ?? userId])
    );

    const toRow = (workload: (typeof workloads)[number]) => ({
      _id: workload._id,
      config: workload.config,
      createdAt: workload.createdAt,
      displayName: workload.displayName,
      failureReason: workload.failureReason,
      name: workload.name,
      namespace: workload.namespace,
      status: workload.status,
      templateId: workload.templateId,
      userEmail: emailByUserId.get(workload.userId) ?? workload.userId,
    });

    return {
      clusters: operators.map((operator) => ({
        _id: operator._id,
        claimedAt: operator.claimedAt,
        description: operator.description,
        healthStatus: operator.healthStatus,
        lastHeartbeatAt: operator.lastHeartbeatAt,
        name: operator.name,
        region: operator.region,
        resourceCapacity: operator.resourceCapacity,
        retentionPolicy: operator.retentionPolicy,
        tags: operator.tags ?? [],
        workloads: workloads
          .filter((workload) => workload.operatorId === operator._id)
          .map(toRow),
      })),
      unclaimedWorkloads: workloads
        .filter((workload) => !workload.operatorId)
        .map(toRow),
    };
  },
  returns: v.object({
    clusters: v.array(
      v.object({
        _id: v.id("operators"),
        claimedAt: v.optional(v.number()),
        description: v.optional(v.string()),
        healthStatus: v.union(
          v.literal("pending"),
          v.literal("healthy"),
          v.literal("offline"),
          v.literal("ready_to_destroy")
        ),
        lastHeartbeatAt: v.optional(v.number()),
        name: v.string(),
        region: v.optional(v.string()),
        // Self-reported on heartbeat (see ai-cloud-operator's internal/
        // capacity package) — display-only, for this fleet view. Never
        // gates a claim; see convex/schema.ts's operators.resourceCapacity
        // doc comment for why.
        resourceCapacity: v.optional(
          v.object({
            allocatableMemoryBytes: v.number(),
            allocatableMilliCpu: v.number(),
            reportedAt: v.number(),
            usedMemoryBytes: v.number(),
            usedMilliCpu: v.number(),
          })
        ),
        retentionPolicy: v.union(v.literal("standard"), v.literal("retain")),
        tags: v.array(v.string()),
        workloads: v.array(clusterWorkloadValidator),
      })
    ),
    unclaimedWorkloads: v.array(clusterWorkloadValidator),
  }),
});

// Admin-only view across every user's files — unlike files/queries.ts's
// listByGroup/get (both scoped to the requesting user), this reads
// unscoped since an admin needs to see and fix any user's rows, not just
// their own. Bounded rather than paginated, same reasoning as
// listClusters above.
export const listFiles = adminQuery({
  args: {},
  handler: async (ctx) => {
    const files = await ctx.db.query("files").order("desc").take(500);

    const userIds = [...new Set(files.map((file) => file.userId))];
    const users = await Promise.all(
      userIds.map((userId) => authComponent.getAnyUserById(ctx, userId))
    );
    const emailByUserId = new Map(
      userIds.map((userId, index) => [userId, users[index]?.email ?? userId])
    );

    return files.map((file) => ({
      _id: file._id,
      createdAt: file.createdAt,
      group: file.group,
      label: file.label,
      r2Bucket: file.r2Bucket,
      r2Key: file.r2Key,
      type: file.type,
      userEmail: emailByUserId.get(file.userId) ?? file.userId,
      userId: file.userId,
    }));
  },
  returns: v.array(adminFileValidator),
});

// Admin-only option list for UserSelect (see entities/session/ui/user-select.tsx):
// every user id referenced by a workload or file that still resolves to a
// real Better Auth user, mapped to their email. Not a full directory of
// every registered user — Better Auth's admin plugin has a listUsers
// endpoint, but it's session-cookie-gated (built for its own HTTP API, not
// for calling from an arbitrary Convex function), so this reuses userIds we
// already have on hand instead of taking on that integration for one
// dropdown. A gateway session is never a distinct source here — it can only
// ever be opened by a user who already owns an active workload (see
// workloads/actions.ts#getWorkloadAccessToken), so the workloads source
// already covers those users. Two things won't appear here: a user who's
// never deployed a workload or backed up a file; and a userId that no
// longer resolves to a real user record (e.g. an account since deleted) —
// showing the bare id as a fake "name" in that case would be more confusing
// than just omitting it.
export const listUserOptions = adminQuery({
  args: {},
  handler: async (ctx) => {
    const [workloads, files] = await Promise.all([
      ctx.db.query("workloads").take(1000),
      ctx.db.query("files").take(1000),
    ]);
    const userIds = [
      ...new Set([
        ...workloads.map((workload) => workload.userId),
        ...files.map((file) => file.userId),
      ]),
    ];
    const users = await Promise.all(
      userIds.map((userId) => authComponent.getAnyUserById(ctx, userId))
    );

    const options = userIds
      .map((userId, index) => {
        const email = users[index]?.email;
        return email ? { id: userId, label: email } : null;
      })
      .filter((option) => option !== null);
    // oxlint-disable-next-line unicorn/no-array-sort -- `options` is a fresh array from `.map()`/`.filter()` just above; sorting it in place mutates no shared state. (toSorted() would need an ES2023 lib bump, out of scope here.)
    return options.sort((a, b) => a.label.localeCompare(b.label));
  },
  returns: v.array(v.object({ id: v.string(), label: v.string() })),
});

const inviteStatusValidator = v.union(
  v.literal("pending"),
  v.literal("rejected"),
  v.literal("canceled"),
  v.literal("used"),
  v.literal("expired")
);

const adminInviteValidator = v.object({
  createdAt: v.number(),
  createdByEmail: v.optional(v.string()),
  email: v.optional(v.string()),
  expiresAt: v.number(),
  groupIds: v.array(v.string()),
  role: v.string(),
  status: inviteStatusValidator,
  token: v.string(),
});

interface InviteRecord {
  createdAt: number;
  createdByUserId: string | null;
  email: string | null;
  expiresAt: number;
  groupIds: string[] | null;
  role: string;
  status: "pending" | "rejected" | "canceled" | "used";
  token: string | null;
}

// Admin-only view of every pending invite, not just the current admin's
// own, and (see cancelInvite in mutations.ts) the ability to cancel any of
// them. better-invite's own client endpoints (authClient.invite.list /
// .cancel) are hard-scoped to `createdByUserId === caller` — see
// node_modules/better-invite/dist/routes/{list-invites,cancel-invite}.mjs
// — which doesn't fit a shared admin console where any admin should be
// able to see and manage invites another admin created. Reading the
// `invite` table directly through the same adapter Better Auth itself uses
// (`authComponent.adapter`) bypasses that per-creator scoping. "expired" is
// computed here the same way better-invite's own /invite/list route
// computes it — it's never persisted as a stored status.
export const listInvites = adminQuery({
  args: {},
  handler: async (ctx) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const invites = await adapter.findMany<InviteRecord>({
      limit: 200,
      model: "invite",
      sortBy: { direction: "desc", field: "createdAt" },
    });

    const creatorIds = [
      ...new Set(
        invites
          .map((invite) => invite.createdByUserId)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const creators = await Promise.all(
      creatorIds.map((id) => authComponent.getAnyUserById(ctx, id))
    );
    const emailByCreatorId = new Map(
      creatorIds.map((id, index) => [id, creators[index]?.email])
    );

    const now = Date.now();
    return invites
      .filter((invite) => invite.token)
      .map((invite) => ({
        createdAt: invite.createdAt,
        createdByEmail: invite.createdByUserId
          ? emailByCreatorId.get(invite.createdByUserId)
          : undefined,
        email: invite.email ?? undefined,
        expiresAt: invite.expiresAt,
        groupIds: invite.groupIds ?? [],
        role: invite.role,
        status: (invite.status === "pending" && invite.expiresAt < now
          ? "expired"
          : invite.status) as
          | "pending"
          | "rejected"
          | "canceled"
          | "used"
          | "expired",
        token: invite.token as string,
      }));
  },
  returns: v.array(adminInviteValidator),
});

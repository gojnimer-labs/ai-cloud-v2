import { v } from "convex/values";

import { authComponent, createAuthOptions } from "../auth";
import { adminQuery } from "../functions";

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
    return options.toSorted((a, b) => a.label.localeCompare(b.label));
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

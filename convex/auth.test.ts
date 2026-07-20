/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent, createAuthOptions } from "./auth";
import authSchema from "./betterAuth/schema";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const authModules = import.meta.glob("./betterAuth/**/*.ts");

test("getCurrentUser returns null when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  const user = await t.query(api.auth.getCurrentUser);
  expect(user).toBeNull();
});

// Mints a real, pending invite directly through the same adapter Better Auth
// itself uses (same shape as convex/admin/mutations.ts#createInvite), then
// activates it through the real `/invite/activate` route to get a genuinely
// signed invite_token cookie value.
const mintInviteToken = async (
  t: ReturnType<typeof convexTest>,
  overrides: { email?: string; groupIds?: string[] } = {}
) => {
  const token = crypto.randomUUID();
  await t.run(async (ctx) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    await adapter.create({
      data: {
        createdAt: Date.now(),
        email: overrides.email,
        expiresAt: Date.now() + 60_000,
        groupIds: overrides.groupIds,
        infinityMaxUses: false,
        maxUses: 1,
        role: "admin",
        shareInviterName: true,
        status: "pending",
        token,
      },
      model: "invite",
    });
  });

  const activateRes = await t.fetch("/api/auth/invite/activate", {
    body: JSON.stringify({ token }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return { cookie: activateRes.headers.get("set-cookie") ?? "", token };
};

// This app's frontend and auth backend are on different origins, so the
// real browser client never sends a literal `Cookie` header for auth state
// — it bridges everything through a `Better-Auth-Cookie` request header
// instead (see crossDomainClient() in src/shared/api/auth-client.ts).
// Sending the invite token exclusively via that bridge header, as done
// here, is what a real cross-domain sign-up actually looks like on the
// wire. Consuming the invite here already works even without
// convex/auth.ts's `stripInviteCookieOutsideSignUp` plugin (better-invite's
// own `after` hook correctly reads it) — this test just pins that down as a
// baseline before the real regression test below.
test("consumes an invite delivered via the cross-domain bridge header on sign-up", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);

  const { cookie, token } = await mintInviteToken(t);
  const email = `${crypto.randomUUID()}@example.com`;

  const signUpRes = await t.fetch("/api/auth/sign-up/email", {
    body: JSON.stringify({
      email,
      name: "Test User",
      password: "password1234",
    }),
    headers: {
      "Better-Auth-Cookie": cookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(signUpRes.status).toBeLessThan(400);

  const { invitation, inviteUses, user } = await t.run(async (ctx) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const invitationRow = await adapter.findOne<{ id: string; status: string }>(
      {
        model: "invite",
        where: [{ field: "token", value: token }],
      }
    );
    const inviteUseRows = invitationRow
      ? await adapter.findMany({
          model: "inviteUse",
          where: [{ field: "inviteId", value: invitationRow.id }],
        })
      : [];
    const userRow = await adapter.findOne<{ email: string; role: string }>({
      model: "user",
      where: [{ field: "email", value: email }],
    });
    return {
      invitation: invitationRow,
      inviteUses: inviteUseRows,
      user: userRow,
    };
  });

  expect(invitation?.status).toBe("used");
  expect(inviteUses).toHaveLength(1);
  expect(user?.role).toBe("admin");
});

// requireInvite's key security property since the sign-up form dropped its
// email field entirely (src/pages/sign-up/ui/sign-up-page.tsx): for a
// targeted invite, the server-set email always wins, regardless of what a
// client sends. A submitted email that merely happened to differ used to
// be *rejected* (INVITE_EMAIL_MISMATCH) — now it's silently overwritten
// before signUpEmailBodySchema ever sees it, so the account that gets
// created uses the invite's own email either way.
test("overwrites a submitted email with the invite's own target email", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);

  const targetEmail = `${crypto.randomUUID()}@example.com`;
  const submittedEmail = `${crypto.randomUUID()}@attacker.example.com`;
  const { cookie } = await mintInviteToken(t, { email: targetEmail });

  const signUpRes = await t.fetch("/api/auth/sign-up/email", {
    body: JSON.stringify({
      email: submittedEmail,
      name: "Test User",
      password: "password1234",
    }),
    headers: {
      "Better-Auth-Cookie": cookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(signUpRes.status).toBeLessThan(400);

  const { submittedUser, targetUser } = await t.run(async (ctx) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    return {
      submittedUser: await adapter.findOne({
        model: "user",
        where: [{ field: "email", value: submittedEmail }],
      }),
      targetUser: await adapter.findOne<{ email: string }>({
        model: "user",
        where: [{ field: "email", value: targetEmail }],
      }),
    };
  });

  expect(submittedUser).toBeNull();
  expect(targetUser?.email).toBe(targetEmail);
});

// The actual reported bug: after a real, successful sign-up, this app's
// cross-domain client keeps the invite_token cookie in its localStorage
// bridge for up to its own 10-minute maxAge (better-invite's own
// `expireCookie` call, meant to clear it, is itself a Set-Cookie response
// header set from an `after` hook that runs *after* `crossDomain`'s
// Set-Cookie -> Set-Better-Auth-Cookie rewrite has already happened for
// that response — see the doc comment on `stripInviteCookieOutsideSignUp`
// in convex/auth.ts — so it never reaches the client). The stale,
// already-consumed invite_token then rides along on the very next request
// — including a login attempt with perfectly valid credentials — and
// without the fix, better-invite's `after` hook (which also matches
// `/sign-in/email`) rejects it with an invite-related error instead of
// letting the sign-in through.
test("logging in right after sign-up isn't blocked by the now-stale invite cookie", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);

  const { cookie } = await mintInviteToken(t);
  const email = `${crypto.randomUUID()}@example.com`;
  const password = "password1234";

  const signUpRes = await t.fetch("/api/auth/sign-up/email", {
    body: JSON.stringify({ email, name: "Test User", password }),
    headers: {
      "Better-Auth-Cookie": cookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(signUpRes.status).toBeLessThan(400);

  // Same invite cookie as above: a real cross-domain client would still be
  // sending this, unchanged, on the very next request.
  const signInRes = await t.fetch("/api/auth/sign-in/email", {
    body: JSON.stringify({ email, password }),
    headers: {
      "Better-Auth-Cookie": cookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(signInRes.status).toBe(200);
});

// Exercises the actual applyInviteGroups hook (see convex/auth.ts) end to
// end through the real sign-up route, rather than calling
// assignGroupsToUserInternal directly — this is what proves the hook is
// wired up and firing at the right point in the real request lifecycle
// (registered after invite({}) so the inviteUse row it depends on already
// exists), not just that the internal mutation's own logic works in
// isolation (see convex/groups/mutations.test.ts for that).
test("assigns an invite's default groups to the new user on sign-up", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);

  const groupId = await t.run((ctx) =>
    ctx.db.insert("groups", { createdAt: Date.now(), name: "engineering" })
  );
  const { cookie } = await mintInviteToken(t, { groupIds: [groupId] });
  const email = `${crypto.randomUUID()}@example.com`;

  const signUpRes = await t.fetch("/api/auth/sign-up/email", {
    body: JSON.stringify({
      email,
      name: "Test User",
      password: "password1234",
    }),
    headers: {
      "Better-Auth-Cookie": cookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(signUpRes.status).toBeLessThan(400);

  const user = await t.run(async (ctx) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    return await adapter.findOne<{ id: string }>({
      model: "user",
      where: [{ field: "email", value: email }],
    });
  });
  expect(user).not.toBeNull();

  const memberships = await t.run((ctx) =>
    ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", (user as { id: string }).id))
      .collect()
  );
  expect(memberships.map((m) => m.groupId)).toEqual([groupId as Id<"groups">]);
});

// A second attempt against the same, now-consumed invite must not be
// silently accepted — this is the "already used" behavior that should only
// ever apply to a genuinely reused link, never to a first-time registration.
test("rejects sign-up with an already-consumed invite token", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);

  const { cookie } = await mintInviteToken(t);

  const firstSignUpRes = await t.fetch("/api/auth/sign-up/email", {
    body: JSON.stringify({
      email: `${crypto.randomUUID()}@example.com`,
      name: "First User",
      password: "password1234",
    }),
    headers: {
      "Better-Auth-Cookie": cookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(firstSignUpRes.status).toBeLessThan(400);

  const secondSignUpRes = await t.fetch("/api/auth/sign-up/email", {
    body: JSON.stringify({
      email: `${crypto.randomUUID()}@example.com`,
      name: "Second User",
      password: "password1234",
    }),
    headers: {
      "Better-Auth-Cookie": cookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(secondSignUpRes.status).toBe(403);
});

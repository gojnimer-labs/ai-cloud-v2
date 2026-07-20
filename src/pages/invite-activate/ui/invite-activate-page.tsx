import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { m } from "@/paraglide/messages";
import { inviteAuthClient } from "@/shared/api/invite-client";
import { AuthBranding } from "@/shared/ui/auth-branding";
import { AuthPageShell } from "@/shared/ui/auth-page-shell";

const fallback = "/" as const;

export const InviteActivatePage = () => {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const convex = useConvex();
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    // Invite links are single-use-intent: activating is the whole point of
    // landing here, so this runs automatically instead of waiting on an
    // extra "Accept" click. The ref guards React 18/19 StrictMode's
    // double-invoke in dev, which would otherwise burn the invite twice.
    if (hasRun.current) {
      return;
    }
    hasRun.current = true;

    (async () => {
      try {
        const { data, error: activateError } =
          await inviteAuthClient.invite.activate({ token });
        if (activateError || !data) {
          setError(activateError?.message ?? m.invite_activate_error_generic());
          return;
        }
        // Ignore the server's own `redirectTo` for navigation purposes
        // here — it exists mainly so better-invite's sign-up hook (a real
        // HTTP redirect the browser follows before our own code ever
        // runs, see the redirectToAfterUpgrade doc comment on
        // convex/admin/mutations.ts#createInvite) has somewhere valid to
        // land for a brand-new account. For the two cases this JSON
        // response covers, we already know exactly where to send the
        // user: an already-authenticated user accepting a role upgrade
        // goes home, and every admin-created invite that reaches this
        // point unauthenticated is for a brand-new account, so it goes to
        // sign-up.
        if (data.action === "REDIRECT_TO_AFTER_UPGRADE") {
          await navigate({ to: fallback });
          return;
        }
        // The token already determines the invite's email/role
        // server-side (see convex/admin/mutations.ts#createInvite) —
        // looked up here, by token, instead of also stuffing the email
        // into the link's query string (redundant, and leaks the address
        // into anything that logs/caches the URL). Fetched imperatively
        // (not via useQuery) so this always reads the current value
        // instead of whatever the reactive query happened to hold — still
        // `undefined`/loading, most of the time — when this fire-once
        // effect's closure was created.
        //
        // Bounded with a timeout: ConvexReactClient is constructed with
        // expectAuth: true (main.tsx), which pauses its socket until auth
        // resolves — client.query() only resolves via that same socket
        // (see convex/react's watchQuery().onUpdate()), so on this
        // unauthenticated page, if auth resolution ever stalls, this
        // would otherwise await forever with nothing to catch. Falling
        // back to no prefill after a timeout is exactly the original,
        // pre-fix behavior — degraded, not stuck.
        const invite = await Promise.race([
          convex.query(api.invites.getInviteInfo, { token }),
          // oxlint-disable-next-line promise/avoid-new -- turning a timer into a promise has no non-`new Promise` form; this is the standard pattern for it.
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 3000);
          }),
        ]);
        await navigate({
          search: invite?.email ? { email: invite.email } : undefined,
          to: "/sign-up",
        });
      } catch (error_) {
        // Without this, a thrown error here (e.g. the getInviteInfo
        // query failing) becomes an unhandled rejection and the page is
        // stuck showing "Activating…" forever with no feedback — the
        // activate() call itself already reports its own failures via
        // activateError above, not by throwing, so this only catches
        // failures past that point. Logged (not shown — the UI stays on
        // the generic message below) so the real cause is visible in the
        // browser console instead of just disappearing.
        console.error("Invite activation failed", error_);
        setError(m.invite_activate_error_generic());
      }
    })();
  }, [token, navigate, convex]);

  return (
    <AuthPageShell>
      <AuthBranding />

      <Card padding={8} width="100%">
        <VStack gap={4} hAlign="stretch">
          <VStack gap={1} hAlign="center">
            <Heading level={2}>{m.invite_activate_heading()}</Heading>
            <Text color="secondary" size="sm" type="body">
              {error
                ? m.invite_activate_error_generic()
                : m.invite_activate_activating()}
            </Text>
          </VStack>

          <VStack hAlign="center">
            <Text color="secondary" type="supporting">
              <Link href="/" type="supporting">
                {m.invite_activate_decline()}
              </Link>
            </Text>
          </VStack>
        </VStack>
      </Card>
    </AuthPageShell>
  );
};

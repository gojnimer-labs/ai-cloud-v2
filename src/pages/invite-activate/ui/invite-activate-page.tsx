import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { m } from "@/paraglide/messages";
import { inviteAuthClient } from "@/shared/api/invite-client";
import { AuthBranding } from "@/shared/ui/auth-branding";
import { AuthPageShell } from "@/shared/ui/auth-page-shell";

const fallback = "/" as const;

export const InviteActivatePage = () => {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  // The token already determines the invite's email/role server-side (see
  // convex/admin/mutations.ts#createInvite) — looked up here, by token,
  // instead of also stuffing the email into the link's query string
  // (redundant, and leaks the address into anything that logs/caches the
  // URL). `undefined` while loading, `null` if the token doesn't match any
  // invite.
  const invite = useQuery(api.invites.getInviteInfo, { token });

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
      const { data, error: activateError } =
        await inviteAuthClient.invite.activate({ token });
      if (activateError || !data) {
        setError(activateError?.message ?? m.invite_activate_error_generic());
        return;
      }
      // Ignore the server's own `redirectTo` for navigation purposes here —
      // it exists mainly so better-invite's sign-up hook (a real HTTP
      // redirect the browser follows before our own code ever runs, see
      // the redirectToAfterUpgrade doc comment on
      // convex/admin/mutations.ts#createInvite) has somewhere valid to land
      // for a brand-new account. For the two cases this JSON response
      // covers, we already know exactly where to send the user: an
      // already-authenticated user accepting a role upgrade goes home, and
      // every admin-created invite that reaches this point unauthenticated
      // is for a brand-new account, so it goes to sign-up.
      if (data.action === "REDIRECT_TO_AFTER_UPGRADE") {
        await navigate({ to: fallback });
        return;
      }
      await navigate({
        search: invite?.email ? { email: invite.email } : undefined,
        to: "/sign-up",
      });
    })();
    // invite is intentionally excluded: it may still be loading when
    // activation starts, but its own query result never changes what
    // activation itself does — only where a subsequent /sign-up redirect
    // sends the prefill from.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [token, navigate]);

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

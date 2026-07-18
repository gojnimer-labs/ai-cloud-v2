import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";

import { m } from "@/paraglide/messages";
import { inviteAuthClient } from "@/shared/api/invite-client";
import { AuthBranding } from "@/shared/ui/auth-branding";
import { AuthPageShell } from "@/shared/ui/auth-page-shell";

const fallback = "/" as const;

export const InviteActivatePage = () => {
  const { token } = useParams({ from: "/invite/$token" });
  const { callbackURL } = useSearch({ from: "/invite/$token" });
  const navigate = useNavigate();
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setIsActivating(true);
    setError(null);
    const { data, error: activateError } =
      await inviteAuthClient.invite.activate({
        callbackURL: callbackURL || undefined,
        token,
      });
    if (activateError || !data) {
      setError(activateError?.message ?? m.invite_activate_error_generic());
      setIsActivating(false);
      return;
    }
    await navigate({ to: data.redirectTo || fallback });
  };

  return (
    <AuthPageShell>
      <AuthBranding />

      <Card padding={8} width="100%">
        <VStack gap={4} hAlign="stretch">
          <VStack gap={1} hAlign="center">
            <Heading level={2}>{m.invite_activate_heading()}</Heading>
            <Text color="secondary" size="sm" type="body">
              {m.invite_activate_subtitle()}
            </Text>
          </VStack>

          {error ? (
            <Text type="supporting" weight="medium">
              {error}
            </Text>
          ) : null}

          <Button
            isDisabled={isActivating}
            label={
              isActivating
                ? m.invite_activate_activating()
                : m.invite_activate_accept()
            }
            onClick={handleAccept}
            size="lg"
            variant="primary"
          />

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

import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/")({
  component: HelloWorld,
});

function HelloWorld() {
  const router = useRouter();
  const navigate = Route.useNavigate();
  const user = useQuery(api.auth.getCurrentUser);

  const handleSignOut = async () => {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/sign-in" });
  };

  return (
    <AppShell contentPadding={6} height="fill">
      <VStack gap={2} hAlign="center" height="100%" justify="center">
        <Heading level={1}>{m.home_heading()}</Heading>
        <Text type="supporting">
          {user
            ? m.home_signed_in_as({ email: user.email })
            : m.home_subtitle_guest()}
        </Text>
        <VStack gap={3} hAlign="center">
          <LocaleSwitcher />
          <Button
            label={m.sign_out()}
            onClick={handleSignOut}
            size="sm"
            variant="secondary"
          />
        </VStack>
      </VStack>
    </AppShell>
  );
}

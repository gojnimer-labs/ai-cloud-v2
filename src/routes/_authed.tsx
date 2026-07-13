import { Center } from "@astryxdesign/core/Center";
import { Text } from "@astryxdesign/core/Text";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Authenticated, AuthLoading } from "convex/react";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    // Only redirect once we actually know the user is unauthenticated —
    // isLoading is briefly true on first load while the Convex auth
    // handshake resolves, and we don't want to bounce a logged-in user.
    if (!(context.auth.isLoading || context.auth.isAuthenticated)) {
      throw redirect({ search: { redirect: location.href }, to: "/sign-in" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <>
      <AuthLoading>
        <Center axis="both" style={{ minHeight: "100dvh" }}>
          <Text type="supporting">{m.loading()}</Text>
        </Center>
      </AuthLoading>
      <Authenticated>
        <Outlet />
      </Authenticated>
    </>
  );
}

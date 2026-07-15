import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AuthedShell } from "@/widgets/authed-shell";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    // Only redirect once we actually know the user is unauthenticated —
    // isLoading is briefly true on first load while the Convex auth
    // handshake resolves, and we don't want to bounce a logged-in user.
    if (!(context.auth.isLoading || context.auth.isAuthenticated)) {
      throw redirect({ search: { redirect: location.href }, to: "/sign-in" });
    }
  },
  component: () => (
    <AuthedShell>
      <Outlet />
    </AuthedShell>
  ),
});

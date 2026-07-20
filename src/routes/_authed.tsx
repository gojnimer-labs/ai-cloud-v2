import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { z } from "zod";

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
  // Declared on the shared authed layout (not a specific page route) since
  // AuthedTopNav — and the settings modal it opens — renders here for every
  // authed page. TanStack Router merges each matched route's own validated
  // search into one object, so every child route's Route.useSearch() sees
  // `settings` too without redeclaring it.
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    settings: z.literal(true).optional().catch(undefined),
  }),
});

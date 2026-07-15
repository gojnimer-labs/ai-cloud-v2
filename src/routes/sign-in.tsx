import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { SignInPage } from "@/pages/sign-in";

const fallback = "/" as const;

export const Route = createFileRoute("/sign-in")({
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect || fallback });
    }
  },
  component: SignInPage,
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then -- zod's own fallback-value .catch(), not Promise#catch.
    redirect: z.string().optional().catch(""),
  }),
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { SignUpPage } from "@/pages/sign-up";

const fallback = "/" as const;

export const Route = createFileRoute("/sign-up")({
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect || fallback });
    }
  },
  component: SignUpPage,
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then -- zod's own fallback-value .catch(), not Promise#catch.
    redirect: z.string().optional().catch(""),
  }),
});

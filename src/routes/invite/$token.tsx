import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { InviteActivatePage } from "@/pages/invite-activate";

export const Route = createFileRoute("/invite/$token")({
  component: InviteActivatePage,
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then -- zod's own fallback-value .catch(), not Promise#catch.
    callbackURL: z.string().optional().catch(""),
  }),
});

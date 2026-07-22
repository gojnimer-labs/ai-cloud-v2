import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { InvitesPage } from "@/pages/admin-invites";

export const Route = createFileRoute("/_authed/admin/invites")({
  component: InvitesPage,
  validateSearch: z.object({
    // Create-only — invites have no edit dialog. The created invite's link
    // is intentionally NOT part of this scheme (see InviteLinkDialog usage
    // in invites-page.tsx): it carries a one-time activation token, and
    // secrets don't belong in a URL that survives in browser history/logs.
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    modal: z.literal("create").optional().catch(undefined),
  }),
});

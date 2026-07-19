import { createFileRoute } from "@tanstack/react-router";

import { InvitesPage } from "@/pages/admin-invites";

export const Route = createFileRoute("/_authed/admin/invites")({
  component: InvitesPage,
});

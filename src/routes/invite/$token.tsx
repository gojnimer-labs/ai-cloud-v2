import { createFileRoute } from "@tanstack/react-router";

import { InviteActivatePage } from "@/pages/invite-activate";

export const Route = createFileRoute("/invite/$token")({
  component: InviteActivatePage,
});

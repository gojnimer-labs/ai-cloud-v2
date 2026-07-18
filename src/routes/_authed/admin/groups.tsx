import { createFileRoute } from "@tanstack/react-router";

import { GroupsPage } from "@/pages/admin-groups";

export const Route = createFileRoute("/_authed/admin/groups")({
  component: GroupsPage,
});

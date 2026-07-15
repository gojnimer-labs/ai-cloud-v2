import { createFileRoute } from "@tanstack/react-router";

import { ClustersPage } from "@/pages/admin-clusters";

export const Route = createFileRoute("/_authed/admin/clusters")({
  component: ClustersPage,
});

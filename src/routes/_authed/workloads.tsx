import { createFileRoute } from "@tanstack/react-router";

import { WorkloadsPage } from "@/pages/workloads";

export const Route = createFileRoute("/_authed/workloads")({
  component: WorkloadsPage,
});

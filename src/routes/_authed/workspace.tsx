import { createFileRoute } from "@tanstack/react-router";

import { WorkspacePage } from "@/pages/workspace";

export const Route = createFileRoute("/_authed/workspace")({
  component: WorkspacePage,
});

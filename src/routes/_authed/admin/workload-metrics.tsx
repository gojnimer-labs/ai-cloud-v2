import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { WorkloadMetricsDashboardPage } from "@/pages/admin-workload-metrics";

export const Route = createFileRoute("/_authed/admin/workload-metrics")({
  component: WorkloadMetricsDashboardPage,
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then -- zod's .catch() is a synchronous schema fallback, not Promise.prototype.catch.
    view: z.enum(["overview", "by-user", "by-workload"]).catch("overview"),
  }),
});

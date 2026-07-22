import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ClustersPage } from "@/pages/admin-clusters";

const CLUSTERS_MODAL_KINDS = ["create", "edit", "new-workload"] as const;

export const Route = createFileRoute("/_authed/admin/clusters")({
  component: ClustersPage,
  // Deliberately excludes the workload operation/redeploy dialogs, the
  // token-reveal dialog, and the detail-panel selection:
  // - operation/redeploy need a catalog that's only fetched for the
  //   currently detail-panel-selected workload (see
  //   useSelectedWorkloadCatalog in clusters-page.tsx) — panels are out of
  //   scope here, so their precondition can't be restored from a URL alone.
  // - token-reveal shows a cluster enrollment token (a secret) — it doesn't
  //   belong in a URL that survives in browser history/logs.
  validateSearch: z.object({
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    clusterId: z.string().optional().catch(undefined),
    // oxlint-disable-next-line promise/prefer-await-to-then, unicorn/no-useless-undefined -- zod's own fallback-value .catch(), not Promise#catch; undefined is the intended "absent" fallback.
    modal: z.enum(CLUSTERS_MODAL_KINDS).optional().catch(undefined),
  }),
});

import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const renderClustersPage = ({
  path = "/admin/clusters",
  unclaimedWorkloads = [],
}: {
  path?: string;
  unclaimedWorkloads?: {
    _id: string;
    createdAt: number;
    displayName: string;
    failureReason?: string;
    name?: string;
    namespace?: string;
    status: string;
    templateId: string;
    userEmail: string;
  }[];
} = {}) => {
  setMockSession({
    data: { user: { email: "admin@example.com", role: "admin" } },
    isPending: false,
  });
  mockQueryResult(api.operators.queries.listClusters, {
    clusters: [
      {
        _id: "operator1",
        claimedAt: undefined,
        description: undefined,
        healthStatus: "healthy",
        lastHeartbeatAt: undefined,
        name: "prod-cluster",
        region: undefined,
        retentionPolicy: "standard",
        tags: [],
        workloads: [
          {
            _id: "workload1",
            createdAt: Date.parse("2026-01-01"),
            displayName: "my-firefox",
            failureReason: undefined,
            name: "my-firefox-abc123",
            namespace: "default",
            status: "active",
            templateId: "firefox",
            userEmail: "user@example.com",
          },
        ],
      },
    ],
    unclaimedWorkloads,
  });
  return renderRoute({ path });
};

test("renders clusters, health status, and their workloads", async () => {
  const screen = await renderClustersPage();

  await expect.element(screen.getByText("prod-cluster")).toBeInTheDocument();
  await expect
    .element(screen.getByRole("img", { name: m.admin_health_healthy() }))
    .toBeInTheDocument();
  await expect.element(screen.getByText("my-firefox")).toBeInTheDocument();
  await expect
    .element(screen.getByText("user@example.com"))
    .toBeInTheDocument();
});

test("shows a requested workload with no operator yet under Unclaimed", async () => {
  const screen = await renderClustersPage({
    unclaimedWorkloads: [
      {
        _id: "workload2",
        createdAt: Date.parse("2026-01-02"),
        displayName: "brand-new-request",
        status: "requested",
        templateId: "nginx",
        userEmail: "other@example.com",
      },
    ],
  });

  await expect
    .element(screen.getByText(m.admin_clusters_unclaimed()))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText("brand-new-request"))
    .toBeInTheDocument();
});

// Regression coverage for the settings-modal-closes-on-reload bug: a fresh
// render from a URL is exactly what a reload is, so these prove the create/
// edit dialogs survive it the same way the settings modal now does.
test("opens the create-cluster dialog from ?modal=create, as if reloaded", async () => {
  const screen = await renderClustersPage({
    path: "/admin/clusters?modal=create",
  });

  await expect
    .element(
      screen.getByRole("heading", { name: m.admin_clusters_create_title() })
    )
    .toBeInTheDocument();
});

test("opens the edit dialog prefilled from ?modal=edit&clusterId=, as if reloaded", async () => {
  const screen = await renderClustersPage({
    path: "/admin/clusters?modal=edit&clusterId=operator1",
  });

  await expect
    .element(
      screen.getByRole("heading", { name: m.admin_clusters_edit_title() })
    )
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("textbox", { name: m.label_name() }))
    .toHaveValue("prod-cluster");
});

test("does not open the dialog for a stale/unknown clusterId", async () => {
  const screen = await renderClustersPage({
    path: "/admin/clusters?modal=edit&clusterId=does-not-exist",
  });

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("opens the new-workload dialog from ?modal=new-workload, as if reloaded", async () => {
  const screen = await renderClustersPage({
    path: "/admin/clusters?modal=new-workload",
  });

  await expect
    .element(screen.getByRole("heading", { name: "New Workload" }))
    .toBeInTheDocument();
});

test("closing the create-cluster dialog removes modal/clusterId from the URL", async () => {
  const { router, ...screen } = await renderClustersPage({
    path: "/admin/clusters?modal=create",
  });
  const dialog = screen.getByRole("dialog");
  await expect
    .element(
      dialog.getByRole("heading", { name: m.admin_clusters_create_title() })
    )
    .toBeInTheDocument();

  await dialog.getByRole("button", { name: m.cancel() }).click();

  await expect.element(dialog).not.toBeInTheDocument();
  await expect.poll(() => router.state.location.search).toEqual({});
});

// An unrecognized `modal` value (e.g. a plain URL typo, or an old link to a
// dialog kind that was deliberately excluded — operation/redeploy stay
// local, see clusters.tsx's doc comment) falls back to "absent" via the
// schema's .catch(), not a crash.
test("silently ignores an unrecognized modal value", async () => {
  const screen = await renderClustersPage({
    path: "/admin/clusters?modal=some-unknown-value",
  });

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

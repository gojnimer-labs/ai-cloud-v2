import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const renderClustersPage = () => {
  setMockSession({
    data: { user: { email: "admin@example.com", role: "admin" } },
    isPending: false,
  });
  mockQueryResult(api.admin.queries.listClusters, [
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
          name: "my-firefox",
          namespace: "default",
          templateId: "firefox",
          userEmail: "user@example.com",
        },
      ],
    },
  ]);
  return renderRoute({ path: "/admin/clusters" });
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

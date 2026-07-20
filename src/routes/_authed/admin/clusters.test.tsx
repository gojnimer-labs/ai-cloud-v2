import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const renderClustersPage = ({
  unclaimedWorkloads = [],
}: {
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

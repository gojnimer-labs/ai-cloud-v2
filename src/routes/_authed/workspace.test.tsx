import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const renderWorkspacePage = () => {
  mockQueryResult(api.presets.queries.listAvailablePresetsForCurrentUser, [
    {
      _id: "preset1",
      displayName: "Firefox Browser",
      groups: [{ _id: "group1", badgeColor: "blue", name: "Engineering" }],
      templateId: "firefox",
      thumbnailUrl: null,
    },
  ]);
  mockQueryResult(api.workloads.queries.listMine, [
    {
      _id: "workload1",
      allowedEntrypoints: "all",
      allowedLifecycleActions: "all",
      allowedOperations: "all",
      createdAt: Date.parse("2026-01-01"),
      displayName: "my-nginx",
      groups: [{ _id: "group1", badgeColor: "blue", name: "Engineering" }],
      sourcePresetDisplayName: "Nginx Preset",
      sourcePresetId: "preset2",
      status: "active",
      templateId: "nginx",
      templateVersion: "v1",
      thumbnailUrl: null,
    },
  ]);
  mockQueryResult(api.operators.queries.listMergedCatalog, [
    {
      description: "",
      entrypoints: [{ label: "Open", name: "http" }],
      icon: "",
      id: "nginx",
      name: "Nginx",
      operations: [],
      parameters: [],
      version: "v1",
    },
  ]);

  return renderRoute({ path: "/workspace" });
};

test("renders both sections as thumbnail grids, not tables or lists", async () => {
  const screen = await renderWorkspacePage();

  await expect
    .element(
      screen.getByRole("heading", {
        name: m.workspace_available_section_title(),
      })
    )
    .toBeInTheDocument();
  await expect
    .element(
      screen.getByRole("heading", {
        name: m.workspace_your_workspaces_section_title(),
      })
    )
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("heading", { name: "Firefox Browser" }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("heading", { name: "my-nginx" }))
    .toBeInTheDocument();
  await expect(screen.getByRole("table")).not.toBeInTheDocument();
});

test("shows the redesigned status indicator and 1-click Open/Stop actions for an active workload", async () => {
  const screen = await renderWorkspacePage();

  await expect
    .element(screen.getByText(m.admin_workload_status_active()).first())
    .toBeInTheDocument();
  await expect
    .element(
      screen.getByRole("button", {
        exact: true,
        name: m.admin_workload_open(),
      })
    )
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: m.admin_workload_pause() }))
    .toBeInTheDocument();
});

test("keeps Delete out of the 1-click action row — only reachable via the MoreMenu trigger", async () => {
  const screen = await renderWorkspacePage();

  await expect
    .element(
      screen.getByRole("button", { name: m.workspace_deployment_delete() })
    )
    .not.toBeInTheDocument();
  await expect
    .element(
      screen.getByRole("button", { name: m.workspace_deployment_actions() })
    )
    .toBeInTheDocument();
});

test("the info hover-card trigger is a small icon, not the whole card", async () => {
  const screen = await renderWorkspacePage();

  await expect
    .element(
      screen.getByRole("button", { name: m.workspace_workload_info_label() })
    )
    .toBeInTheDocument();
});

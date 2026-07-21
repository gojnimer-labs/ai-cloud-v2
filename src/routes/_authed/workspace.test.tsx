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
      hasPresetUpdate: false,
      sourcePresetDisplayName: "Nginx Preset",
      sourcePresetId: "preset2",
      status: "active",
      templateId: "nginx",
      templateVersion: "1",
      thumbnailUrl: null,
    },
    {
      _id: "workload2",
      allowedEntrypoints: "all",
      allowedLifecycleActions: "all",
      allowedOperations: "all",
      createdAt: Date.parse("2026-01-02"),
      displayName: "my-chrome",
      groups: [],
      hasPresetUpdate: false,
      sourcePresetDisplayName: "Chrome Preset",
      sourcePresetId: "preset3",
      status: "stopped",
      templateId: "chrome",
      templateVersion: "1",
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
      version: "1",
    },
    {
      description: "",
      entrypoints: [{ label: "Open", name: "http" }],
      icon: "",
      id: "chrome",
      name: "Chrome",
      operations: [],
      parameters: [],
      version: "1",
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
  // The workload's thumbnail is the whole card now — no separate info icon
  // trigger. Its native "Open {name}" button (from an active, single-
  // entrypoint workload) is the proof it rendered for the right workload.
  await expect
    .element(
      screen.getByRole("button", {
        exact: true,
        name: `${m.admin_workload_open()} my-nginx`,
      })
    )
    .toBeInTheDocument();
  await expect(screen.getByRole("table")).not.toBeInTheDocument();
});

test("shows a single click-to-open icon (no visible button row, no name/badges) for an active, single-entrypoint workload", async () => {
  const screen = await renderWorkspacePage();

  await expect
    .element(
      screen.getByRole("button", {
        exact: true,
        name: `${m.admin_workload_open()} my-nginx`,
      })
    )
    .toBeInTheDocument();
  // Stop is menu-only now — never a visible 1-click button on the card.
  await expect
    .element(screen.getByRole("button", { name: m.admin_workload_pause() }))
    .not.toBeInTheDocument();
  // Name/badges no longer render below the thumbnail as visible text.
  await expect
    .element(screen.getByRole("heading", { name: "my-nginx" }))
    .not.toBeInTheDocument();
});

test("keeps Delete out of the 1-click surface — reachable only via the right-click ContextMenu", async () => {
  const screen = await renderWorkspacePage();

  await expect
    .element(
      screen.getByRole("button", { name: m.workspace_deployment_delete() })
    )
    .not.toBeInTheDocument();

  await screen
    .getByRole("button", { name: `${m.admin_workload_open()} my-nginx` })
    .click({ button: "right" });

  await expect
    .element(
      screen.getByRole("menuitem", { name: m.workspace_deployment_delete() })
    )
    .toBeInTheDocument();
});

test("the thumbnail itself is the hover-card trigger and reveals the workload's name/details on hover", async () => {
  const screen = await renderWorkspacePage();
  const thumbnail = screen.getByRole("button", {
    exact: true,
    name: `${m.admin_workload_open()} my-nginx`,
  });

  await expect.element(thumbnail).toBeInTheDocument();
  await thumbnail.hover();

  await expect
    .element(screen.getByRole("heading", { level: 4, name: "my-nginx" }))
    .toBeInTheDocument();
  // templateId · vtemplateVersion — the HoverCard body's identity row, not
  // sourcePresetDisplayName (which WorkloadCard never renders directly).
  await expect.element(screen.getByText("nginx · v1")).toBeInTheDocument();
});

test("a stopped workload's thumbnail is still hoverable (dimmed, not native-disabled) and offers Click to resume", async () => {
  const screen = await renderWorkspacePage();
  // A stopped workload's Thumbnail keeps its native "Open {name}" wrapper —
  // WorkloadCard wires onClick to the Resume handler for "paused", not
  // Thumbnail's own isDisabled (which would set pointer-events:none and
  // block hover entirely — the exact regression this test guards against).
  const thumbnail = screen.getByRole("button", {
    exact: true,
    name: `${m.admin_workload_open()} my-chrome`,
  });

  await expect.element(thumbnail).toBeInTheDocument();
  await thumbnail.hover();

  await expect
    .element(screen.getByRole("heading", { level: 4, name: "my-chrome" }))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Click to resume")).toBeInTheDocument();
});

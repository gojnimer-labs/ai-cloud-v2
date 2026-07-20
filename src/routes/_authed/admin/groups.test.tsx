import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const GROUPS = [
  { _id: "group1", createdAt: Date.parse("2026-01-01"), name: "Engineering" },
  { _id: "group2", createdAt: Date.parse("2026-01-02"), name: "Design" },
];

const renderGroupsPage = (path: string) => {
  setMockSession({
    data: { user: { email: "admin@example.com", role: "admin" } },
    isPending: false,
  });
  mockQueryResult(api.groups.queries.listGroups, GROUPS);
  return renderRoute({ path });
};

// Regression coverage for the settings-modal-closes-on-reload bug: a fresh
// render from a URL is exactly what a reload is, so these prove the modal
// state survives it — the same property that motivated this whole pattern.
test("opens the create-group dialog from ?modal=create, as if reloaded", async () => {
  const screen = await renderGroupsPage("/admin/groups?modal=create");

  await expect
    .element(
      screen.getByRole("heading", { name: m.admin_groups_create_title() })
    )
    .toBeInTheDocument();
});

test("opens the edit dialog prefilled from ?modal=edit&groupId=, as if reloaded", async () => {
  const screen = await renderGroupsPage(
    "/admin/groups?modal=edit&groupId=group2"
  );

  await expect
    .element(screen.getByRole("heading", { name: m.admin_groups_edit_title() }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("textbox", { name: m.admin_groups_name_label() }))
    .toHaveValue("Design");
});

test("does not open the dialog for a stale/unknown groupId", async () => {
  const screen = await renderGroupsPage(
    "/admin/groups?modal=edit&groupId=does-not-exist"
  );

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

// Confirms the parent /_authed route's `settings` search param survives
// navigation/reload on a child route that never mentions it in its own
// validateSearch schema — the router merges validated search across the
// whole matched route tree rather than each level clobbering the others.
test("keeps the settings modal reachable alongside a page that has its own search params", async () => {
  const screen = await renderGroupsPage("/admin/groups?settings=true");

  await expect
    .element(screen.getByRole("heading", { name: m.settings_nav_general() }))
    .toBeInTheDocument();
});

test("clicking New group opens the dialog and puts modal=create in the URL", async () => {
  const { router, ...screen } = await renderGroupsPage("/admin/groups");

  await screen
    .getByRole("button", { name: m.admin_groups_create_button() })
    .click();

  await expect
    .element(
      screen.getByRole("heading", { name: m.admin_groups_create_title() })
    )
    .toBeInTheDocument();
  await expect
    .poll(() => router.state.location.search)
    .toEqual({ modal: "create" });
});

test("closing the dialog removes modal/groupId from the URL", async () => {
  const { router, ...screen } = await renderGroupsPage(
    "/admin/groups?modal=edit&groupId=group2"
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: m.admin_groups_edit_title() }))
    .toBeInTheDocument();

  await dialog.getByRole("button", { name: m.cancel() }).click();

  await expect.element(dialog).not.toBeInTheDocument();
  await expect.poll(() => router.state.location.search).toEqual({});
});

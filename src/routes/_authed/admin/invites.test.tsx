import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const renderInvitesPage = (path: string) => {
  setMockSession({
    data: { user: { email: "admin@example.com", role: "admin" } },
    isPending: false,
  });
  mockQueryResult(api.invites.queries.listInvites, []);
  mockQueryResult(api.groups.queries.listGroups, []);
  return renderRoute({ path });
};

// Regression coverage for the settings-modal-closes-on-reload bug: a fresh
// render from a URL is exactly what a reload is, so this proves the create
// dialog survives it the same way the settings modal now does.
test("opens the create-invite dialog from ?modal=create, as if reloaded", async () => {
  const screen = await renderInvitesPage("/admin/invites?modal=create");

  await expect
    .element(
      screen.getByRole("heading", { name: m.admin_invites_dialog_heading() })
    )
    .toBeInTheDocument();
});

test("clicking Invite user opens the dialog and puts modal=create in the URL", async () => {
  const { router, ...screen } = await renderInvitesPage("/admin/invites");

  await screen
    .getByRole("button", { name: m.admin_invites_create_button() })
    .click();

  await expect
    .element(
      screen.getByRole("heading", { name: m.admin_invites_dialog_heading() })
    )
    .toBeInTheDocument();
  await expect
    .poll(() => router.state.location.search)
    .toEqual({ modal: "create" });
});

test("closing the dialog removes modal from the URL", async () => {
  const { router, ...screen } = await renderInvitesPage(
    "/admin/invites?modal=create"
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(
      dialog.getByRole("heading", { name: m.admin_invites_dialog_heading() })
    )
    .toBeInTheDocument();

  await dialog.getByRole("button", { name: m.cancel() }).click();

  await expect.element(dialog).not.toBeInTheDocument();
  await expect.poll(() => router.state.location.search).toEqual({});
});

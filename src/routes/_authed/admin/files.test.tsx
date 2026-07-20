import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const FILES = [
  {
    _id: "file1",
    createdAt: Date.parse("2026-01-01"),
    group: "profiles_firefox",
    label: "Backup one",
    r2Bucket: "backups",
    r2Key: "file1.tar",
    type: "profile",
    userEmail: "user@example.com",
    userId: "user1",
  },
];

const renderFilesPage = (path: string) => {
  setMockSession({
    data: { user: { email: "admin@example.com", role: "admin" } },
    isPending: false,
  });
  mockQueryResult(api.files.queries.listFiles, FILES);
  mockQueryResult(api.invites.queries.listUserOptions, [
    { id: "user1", label: "user@example.com" },
  ]);
  return renderRoute({ path });
};

// Regression coverage for the settings-modal-closes-on-reload bug: a fresh
// render from a URL is exactly what a reload is, so this proves the edit
// dialog survives it the same way the settings modal now does.
test("opens the edit dialog prefilled from ?modal=edit&fileId=, as if reloaded", async () => {
  const screen = await renderFilesPage("/admin/files?modal=edit&fileId=file1");

  await expect
    .element(screen.getByRole("heading", { name: m.admin_files_edit_title() }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("textbox", { name: m.label_name() }))
    .toHaveValue("Backup one");
});

test("does not open the dialog for a stale/unknown fileId", async () => {
  const screen = await renderFilesPage(
    "/admin/files?modal=edit&fileId=does-not-exist"
  );

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("clicking Edit in the detail panel's MoreMenu opens the dialog with fileId in the URL", async () => {
  const { router, ...screen } = await renderFilesPage("/admin/files");

  await screen.getByText("Backup one").click();
  await screen
    .getByRole("button", { name: m.admin_files_row_actions() })
    .click();
  await screen.getByRole("menuitem", { name: m.admin_files_edit() }).click();

  await expect
    .element(screen.getByRole("heading", { name: m.admin_files_edit_title() }))
    .toBeInTheDocument();
  await expect
    .poll(() => router.state.location.search)
    .toEqual({ fileId: "file1", modal: "edit" });
});

test("closing the dialog removes modal/fileId from the URL", async () => {
  const { router, ...screen } = await renderFilesPage(
    "/admin/files?modal=edit&fileId=file1"
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: m.admin_files_edit_title() }))
    .toBeInTheDocument();

  await dialog.getByRole("button", { name: m.cancel() }).click();

  await expect.element(dialog).not.toBeInTheDocument();
  await expect.poll(() => router.state.location.search).toEqual({});
});

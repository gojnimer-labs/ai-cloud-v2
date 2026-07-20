import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

test("shows the signed-in user's email when available", async () => {
  mockQueryResult(api.auth.getCurrentUser, { email: "person@example.com" });
  const screen = await renderRoute({ path: "/" });

  await expect
    .element(
      screen.getByText(m.home_signed_in_as({ email: "person@example.com" }))
    )
    .toBeInTheDocument();
});

test("shows guest text when there is no user yet", async () => {
  const screen = await renderRoute({ path: "/" });

  await expect
    .element(screen.getByText(m.home_subtitle_guest()))
    .toBeInTheDocument();
});

test("renders the locale switcher", async () => {
  const screen = await renderRoute({ path: "/" });

  await expect
    .element(screen.getByRole("combobox", { name: "Language" }))
    .toBeInTheDocument();
});

test("opens the settings modal to General, showing the signed-in user", async () => {
  mockQueryResult(api.auth.getCurrentUser, {
    email: "gen@example.com",
    name: "Gen Person",
  });
  const screen = await renderRoute({ path: "/" });

  await screen.getByRole("button", { name: m.settings_dialog_title() }).click();

  // Scoped to the dialog — the home page behind it renders its own
  // LocaleSwitcher too, so an unscoped query would match both.
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: m.settings_nav_general() }))
    .toBeInTheDocument();
  await expect.element(dialog.getByText("Gen Person")).toBeInTheDocument();
  await expect.element(dialog.getByText("gen@example.com")).toBeInTheDocument();
  await expect
    .element(dialog.getByRole("combobox", { name: m.settings_theme_label() }))
    .toBeInTheDocument();
  await expect
    .element(dialog.getByRole("combobox", { name: "Language" }))
    .toBeInTheDocument();
});

test("switches the settings modal to the security section", async () => {
  const screen = await renderRoute({ path: "/" });

  await screen.getByRole("button", { name: m.settings_dialog_title() }).click();
  const dialog = screen.getByRole("dialog");
  await dialog.getByRole("button", { name: m.settings_nav_security() }).click();

  await expect
    .element(dialog.getByRole("heading", { name: m.settings_nav_security() }))
    .toBeInTheDocument();
  await expect
    .element(dialog.getByLabelText(m.label_current_password()))
    .toBeInTheDocument();
  // Sign out lives at the bottom of the sidebar nav, not inside either
  // section's own content.
  await expect
    .element(dialog.getByRole("button", { name: m.sign_out() }))
    .toBeInTheDocument();
});

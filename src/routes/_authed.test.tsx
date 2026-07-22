import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

test("redirects to sign-in when unauthenticated", async () => {
  const { router } = await renderRoute({
    auth: { isAuthenticated: false, isLoading: false },
    path: "/",
  });

  await expect.poll(() => router.state.location.pathname).toBe("/sign-in");
});

test("shows a loading state while auth is resolving", async () => {
  const screen = await renderRoute({
    auth: { isAuthenticated: false, isLoading: true },
    path: "/",
  });

  await expect.element(screen.getByText(m.loading())).toBeInTheDocument();
});

test("renders the app shell and nested route once authenticated", async () => {
  const screen = await renderRoute({
    auth: { isAuthenticated: true, isLoading: false },
    path: "/",
  });

  await expect
    .element(
      screen.getByRole("heading", { level: 1, name: m.workspace_page_title() })
    )
    .toBeInTheDocument();
  // Shell-only content (not page content) — proves AuthedShell itself
  // rendered around the nested route, not just the route in isolation.
  await expect
    .element(screen.getByRole("link", { name: "Skip to content" }))
    .toBeInTheDocument();
});

// Regression test for the settings modal closing on a locale switch: that
// switch reloads the page (see locale-switcher.tsx -> paraglide's
// setLocale), and a fresh render from a URL is exactly what a reload is —
// no React state carries over, only the URL does.
test("reopens the settings modal from ?settings=true, as if reloaded", async () => {
  const screen = await renderRoute({ path: "/?settings=true" });

  await expect
    .element(screen.getByRole("heading", { name: m.settings_nav_general() }))
    .toBeInTheDocument();
});

test("removes the settings search param when the modal is closed", async () => {
  const screen = await renderRoute({ path: "/?settings=true" });
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: m.settings_nav_general() }))
    .toBeInTheDocument();

  await dialog.getByRole("button", { name: "Close" }).click();

  await expect.element(dialog).not.toBeInTheDocument();
});

test("opens the settings modal to General, showing the signed-in user", async () => {
  mockQueryResult(api.auth.getCurrentUser, {
    email: "gen@example.com",
    name: "Gen Person",
  });
  const screen = await renderRoute({ path: "/" });

  await screen.getByRole("button", { name: m.settings_dialog_title() }).click();

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

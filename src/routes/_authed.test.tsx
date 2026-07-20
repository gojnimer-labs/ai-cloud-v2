import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
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

  await expect.element(screen.getByText(m.home_heading())).toBeInTheDocument();
  await expect.element(screen.getByText(m.nav_dashboard())).toBeInTheDocument();
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

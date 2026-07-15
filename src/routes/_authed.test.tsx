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

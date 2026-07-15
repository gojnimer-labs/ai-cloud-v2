import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { renderRoute } from "@/test/render";

test("shows a loading state while the session is pending", async () => {
  setMockSession({ data: null, isPending: true });
  const screen = await renderRoute({ path: "/admin" });

  await expect.element(screen.getByText(m.loading())).toBeInTheDocument();
});

test("redirects a non-admin user away from /admin", async () => {
  setMockSession({
    data: { user: { email: "member@example.com", role: "member" } },
    isPending: false,
  });
  const { router } = await renderRoute({ path: "/admin" });

  await expect.poll(() => router.state.location.pathname).toBe("/");
});

test("renders nested admin content for an admin user", async () => {
  setMockSession({
    data: { user: { email: "admin@example.com", role: "admin" } },
    isPending: false,
  });
  const { router } = await renderRoute({ path: "/admin" });

  await expect
    .poll(() => router.state.location.pathname)
    .toBe("/admin/clusters");
});

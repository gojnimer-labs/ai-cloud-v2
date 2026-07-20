import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const ALERTS = [
  {
    _id: "alert1",
    body: "We will be down briefly.",
    createdAt: Date.parse("2026-01-01"),
    createdBy: "admin_1",
    isActive: true,
    isDismissable: true,
    title: "Scheduled maintenance",
    variant: "warning",
  },
];

const renderNotificationsPage = (path: string, alerts = ALERTS) => {
  setMockSession({
    data: { user: { email: "admin@example.com", role: "admin" } },
    isPending: false,
  });
  mockQueryResult(api.systemAlerts.queries.listAllForAdmin, alerts);
  mockQueryResult(api.groups.queries.listGroups, []);
  mockQueryResult(api.invites.queries.listUserOptions, []);
  return renderRoute({ path });
};

test("opens the compose dialog from ?modal=compose, as if reloaded", async () => {
  const screen = await renderNotificationsPage(
    "/admin/notifications?modal=compose"
  );

  await expect
    .element(
      screen.getByRole("heading", {
        name: m.admin_notifications_compose_title(),
      })
    )
    .toBeInTheDocument();
});

test("clicking New notification opens the dialog and puts modal=compose in the URL", async () => {
  const { router, ...screen } = await renderNotificationsPage(
    "/admin/notifications"
  );

  await screen
    .getByRole("button", { name: m.admin_notifications_compose_button() })
    .click();

  await expect
    .element(
      screen.getByRole("heading", {
        name: m.admin_notifications_compose_title(),
      })
    )
    .toBeInTheDocument();
  await expect
    .poll(() => router.state.location.search)
    .toEqual({ modal: "compose" });
});

test("renders existing system alerts in the table", async () => {
  const screen = await renderNotificationsPage("/admin/notifications");

  await expect
    .element(screen.getByText("Scheduled maintenance"))
    .toBeInTheDocument();
});

test("shows the empty state when there are no system alerts", async () => {
  const screen = await renderNotificationsPage("/admin/notifications", []);

  await expect
    .element(screen.getByText(m.admin_notifications_empty_title()))
    .toBeInTheDocument();
});

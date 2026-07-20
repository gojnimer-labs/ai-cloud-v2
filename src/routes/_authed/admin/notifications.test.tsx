import { api } from "@convex/_generated/api";
import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSession } from "@/test/mocks/auth-client";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";

const ALERTS: Record<string, unknown>[] = [
  {
    _id: "alert1",
    alertId: "alert1",
    body: "We will be down briefly.",
    createdAt: Date.parse("2026-01-01"),
    createdBy: "admin_1",
    isActive: true,
    kind: "alert",
    title: "Scheduled maintenance",
    topic: "global",
    variant: "warning",
  },
];

const renderNotificationsPage = (path: string, history = ALERTS) => {
  setMockSession({
    data: { user: { email: "admin@example.com", role: "admin" } },
    isPending: false,
  });
  mockQueryResult(api.notifications.queries.listHistoryForAdmin, history);
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

test("renders an existing system alert in the history table", async () => {
  const screen = await renderNotificationsPage("/admin/notifications");

  await expect
    .element(screen.getByText("Scheduled maintenance"))
    .toBeInTheDocument();
});

test("renders a past send alongside system alerts in the history table", async () => {
  const screen = await renderNotificationsPage("/admin/notifications", [
    ...ALERTS,
    {
      _id: "send1",
      createdAt: Date.parse("2026-01-02"),
      createdBy: "admin_1",
      kind: "send",
      recipientCount: 3,
      targetMode: "groups",
      targetSummary: "Engineering, Design",
      title: "New feature rollout",
      variant: "info",
    },
  ]);

  await expect
    .element(screen.getByText("New feature rollout"))
    .toBeInTheDocument();
  await expect
    .element(screen.getByText("Engineering, Design"))
    .toBeInTheDocument();
});

test("shows the empty state when there is no notification history", async () => {
  const screen = await renderNotificationsPage("/admin/notifications", []);

  await expect
    .element(screen.getByText(m.admin_notifications_empty_title()))
    .toBeInTheDocument();
});

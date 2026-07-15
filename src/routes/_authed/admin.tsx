import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AdminGuard } from "@/entities/session";

export const Route = createFileRoute("/_authed/admin")({
  component: () => (
    <AdminGuard>
      <Outlet />
    </AdminGuard>
  ),
});

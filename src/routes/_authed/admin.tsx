import { Center } from "@astryxdesign/core/Center";
import { Text } from "@astryxdesign/core/Text";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const isAdmin = session?.user?.role === "admin";

  // No route-loader gate here (this app has no query-client/loader
  // integration for Convex yet) — same component-level pattern _authed.tsx
  // already uses for the isAuthenticated check.
  useEffect(() => {
    if (!(isPending || isAdmin)) {
      navigate({ to: "/" });
    }
  }, [isPending, isAdmin, navigate]);

  if (isPending || !isAdmin) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.loading()}</Text>
      </Center>
    );
  }

  return <Outlet />;
}

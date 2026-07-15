import { Center } from "@astryxdesign/core/Center";
import { Text } from "@astryxdesign/core/Text";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages";

import { useAdminGuard } from "../model/use-admin-guard";

// No route-loader gate here (this app has no query-client/loader
// integration for Convex yet) — same component-level pattern the
// authed-shell widget already uses for the isAuthenticated check.
export const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { isAdmin, isPending } = useAdminGuard();
  const navigate = useNavigate();

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

  return children;
};

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { NewVersionBanner } from "@/components/new-version-banner";

export interface AuthRouterContext {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface RouterContext {
  auth: AuthRouterContext;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <NewVersionBanner />
      <Outlet />
    </>
  ),
});

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

export interface AuthRouterContext {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface RouterContext {
  auth: AuthRouterContext;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

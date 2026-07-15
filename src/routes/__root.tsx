import { createRootRouteWithContext } from "@tanstack/react-router";

import { RootLayout } from "@/app/root-layout";

export interface AuthRouterContext {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface RouterContext {
  auth: AuthRouterContext;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

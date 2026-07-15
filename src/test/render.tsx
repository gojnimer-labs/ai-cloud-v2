import { Theme } from "@astryxdesign/core";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { RenderResult } from "vitest-browser-react";
import { render } from "vitest-browser-react";

import { appTheme } from "@/app/config/theme";
import { routeTree } from "@/routeTree.gen";
import { setMockAuthState } from "@/test/mocks/convex-react";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface RenderRouteOptions {
  auth?: AuthState;
  path?: string;
}

const createTestRouter = (auth: AuthState, path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] });
  return createRouter({ context: { auth }, history, routeTree });
};

// Does NOT reset the convex-react/auth-client mocks — a test must be able to
// call mockQueryResult()/setMockSignInEmail() etc. *before* renderRoute() to
// seed the render, and resetting here would silently wipe that out. Mocks
// are cleared between tests by the global afterEach in src/test/setup.ts.
//
// router-context auth (fed to beforeLoad guards) and convex/react's own auth
// state (read by Authenticated/AuthLoading) are two independently-fed things
// in the real app (main.tsx derives both from one useConvexAuth() call) — set
// both from the same value here so tests can't accidentally desync them.
export const renderRoute = async ({
  path = "/",
  auth = { isAuthenticated: true, isLoading: false },
}: RenderRouteOptions = {}): Promise<
  RenderResult & { router: ReturnType<typeof createTestRouter> }
> => {
  setMockAuthState(auth);

  const router = createTestRouter(auth, path);

  return {
    router,
    ...(await render(
      <Theme mode="system" theme={appTheme}>
        <RouterProvider router={router} />
      </Theme>
    )),
  };
};

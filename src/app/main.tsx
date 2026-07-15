import { Theme } from "@astryxdesign/core";
import type { AuthClient } from "@convex-dev/better-auth/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { RouterProvider } from "@tanstack/react-router";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";

import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { authClient } from "@/shared/api/auth-client";

import { appTheme } from "./config/theme";
import { router } from "./router";

import "./styles/index.css";

// setLocale() reloads the page, so a one-time sync at startup (rather than a
// reactive effect) is enough to keep these in step with the active locale.
document.documentElement.lang = getLocale();
document.title = m.app_title();

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
  {
    expectAuth: true,
  }
);

const InnerApp = () => {
  const { isLoading, isAuthenticated } = useConvexAuth();

  // Passing a new `context` object to RouterProvider updates the router's
  // stored context, but does NOT retroactively re-run beforeLoad for a route
  // that's already matched — that requires an explicit invalidate() so the
  // _authed guard (see src/routes/_authed.tsx) re-checks once auth resolves.
  const isFirstRender = useRef(true);
  // oxlint-disable-next-line react/exhaustive-deps -- isLoading/isAuthenticated are the intentional re-run trigger, not read in the effect body.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    router.invalidate();
  }, [isLoading, isAuthenticated]);

  return (
    <RouterProvider
      context={{ auth: { isAuthenticated, isLoading } }}
      router={router}
    />
  );
};

const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error("index.html always has a #root div.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Theme mode="system" theme={appTheme}>
      {/* authClient's own inferred plugin-union type doesn't structurally match
          AuthClient here (a better-auth/Convex generic-inference limitation, not
          a runtime issue) — see src/shared/api/auth-client.ts */}
      <ConvexBetterAuthProvider
        authClient={authClient as unknown as AuthClient}
        client={convex}
      >
        <InnerApp />
      </ConvexBetterAuthProvider>
    </Theme>
  </React.StrictMode>
);

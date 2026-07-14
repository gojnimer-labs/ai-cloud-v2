// Trivial change to trigger a deploy and test the update-announcer banner.
import {
  type AuthClient,
  ConvexBetterAuthProvider,
} from "@convex-dev/better-auth/react";
import { RouterProvider } from "@tanstack/react-router";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { router } from "./router";
import "./index.css";

// setLocale() reloads the page, so a one-time sync at startup (rather than a
// reactive effect) is enough to keep these in step with the active locale.
document.documentElement.lang = getLocale();
document.title = m.app_title();

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function InnerApp() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  // Passing a new `context` object to RouterProvider updates the router's
  // stored context, but does NOT retroactively re-run beforeLoad for a route
  // that's already matched — that requires an explicit invalidate() so the
  // _authed guard (see src/routes/_authed.tsx) re-checks once auth resolves.
  const isFirstRender = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: isLoading/isAuthenticated are the intentional re-run trigger, not read in the effect body.
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
}

// biome-ignore lint/style/noNonNullAssertion: index.html always has a #root div.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* authClient's own inferred plugin-union type doesn't structurally match
        AuthClient here (a better-auth/Convex generic-inference limitation, not
        a runtime issue) — see src/lib/auth-client.ts */}
    <ConvexBetterAuthProvider
      authClient={authClient as unknown as AuthClient}
      client={convex}
    >
      <InnerApp />
    </ConvexBetterAuthProvider>
  </React.StrictMode>
);

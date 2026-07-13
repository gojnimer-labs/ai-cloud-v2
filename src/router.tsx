import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  context: {
    // Supplied reactively by <RouterProvider context={{ auth }} /> in main.tsx.
    // biome-ignore lint/style/noNonNullAssertion: placeholder overwritten before first render.
    auth: undefined!,
  },
  defaultPreload: "intent",
  routeTree,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

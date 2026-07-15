import { Outlet } from "@tanstack/react-router";

import { NewVersionBanner } from "./new-version-banner/ui/new-version-banner";

export const RootLayout = () => (
  <>
    <NewVersionBanner />
    <Outlet />
  </>
);

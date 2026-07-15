import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import {
  HomeIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useRouterState } from "@tanstack/react-router";

import { useCurrentUser } from "@/entities/session";
import { m } from "@/paraglide/messages";

export const AuthedSideNav = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const user = useCurrentUser();

  return (
    <SideNav collapsible>
      <SideNavSection isHeaderHidden title="Main">
        <SideNavItem
          href="/"
          icon={HomeIcon}
          isSelected={pathname === "/"}
          label={m.nav_dashboard()}
        />
        <SideNavItem
          href="/workloads"
          icon={ServerStackIcon}
          isSelected={pathname.startsWith("/workloads")}
          label={m.nav_workloads()}
        />
      </SideNavSection>
      {user?.role === "admin" ? (
        <SideNavSection title={m.nav_admin()}>
          <SideNavItem
            href="/admin/clusters"
            icon={ShieldCheckIcon}
            isSelected={pathname.startsWith("/admin/clusters")}
            label={m.nav_clusters()}
          />
        </SideNavSection>
      ) : null}
    </SideNav>
  );
};

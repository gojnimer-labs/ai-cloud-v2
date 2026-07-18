import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import {
  DocumentIcon,
  HomeIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  UsersIcon,
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
          <SideNavItem
            href="/admin/files"
            icon={DocumentIcon}
            isSelected={pathname.startsWith("/admin/files")}
            label={m.nav_files()}
          />
          <SideNavItem
            href="/admin/users"
            icon={UsersIcon}
            isSelected={pathname.startsWith("/admin/users")}
            label={m.nav_users()}
          />
        </SideNavSection>
      ) : null}
    </SideNav>
  );
};

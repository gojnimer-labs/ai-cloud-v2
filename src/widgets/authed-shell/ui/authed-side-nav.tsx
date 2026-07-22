import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import {
  BellIcon,
  ChartBarIcon,
  DocumentIcon,
  EnvelopeIcon,
  RectangleStackIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  UserGroupIcon,
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
          icon={Squares2X2Icon}
          isSelected={pathname === "/"}
          label={m.nav_workspace()}
        />
      </SideNavSection>
      {user?.role === "admin" ? (
        <>
          <SideNavSection title={m.nav_infrastructure()}>
            <SideNavItem
              href="/admin/clusters"
              icon={ShieldCheckIcon}
              isSelected={pathname.startsWith("/admin/clusters")}
              label={m.nav_fleet()}
            />
            <SideNavItem
              href="/admin/files"
              icon={DocumentIcon}
              isSelected={pathname.startsWith("/admin/files")}
              label={m.nav_files()}
            />
            <SideNavItem
              href="/admin/workload-metrics"
              icon={ChartBarIcon}
              isSelected={pathname.startsWith("/admin/workload-metrics")}
              label={m.nav_workload_metrics()}
            />
          </SideNavSection>
          <SideNavSection title={m.nav_admin()}>
            <SideNavItem
              href="/admin/users"
              icon={UsersIcon}
              isSelected={pathname.startsWith("/admin/users")}
              label={m.nav_users()}
            />
            <SideNavItem
              href="/admin/groups"
              icon={UserGroupIcon}
              isSelected={pathname.startsWith("/admin/groups")}
              label={m.nav_groups()}
            />
            <SideNavItem
              href="/admin/presets"
              icon={RectangleStackIcon}
              isSelected={pathname.startsWith("/admin/presets")}
              label={m.nav_presets()}
            />
            <SideNavItem
              href="/admin/invites"
              icon={EnvelopeIcon}
              isSelected={pathname.startsWith("/admin/invites")}
              label={m.nav_invites()}
            />
            <SideNavItem
              href="/admin/notifications"
              icon={BellIcon}
              isSelected={pathname.startsWith("/admin/notifications")}
              label={m.nav_notifications()}
            />
          </SideNavSection>
        </>
      ) : null}
    </SideNav>
  );
};

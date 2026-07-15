import { Icon } from "@astryxdesign/core/Icon";
import { ListItem } from "@astryxdesign/core/List";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import {
  CubeIcon,
  HomeIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  Square3Stack3DIcon,
} from "@heroicons/react/24/outline";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";

import { useCurrentUser } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";

export const AuthedSideNav = () => {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const user = useCurrentUser();

  const handleSignOut = async () => {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/sign-in" });
  };

  return (
    <SideNav
      collapsible
      header={
        <SideNavHeading
          heading={m.product_name()}
          icon={<NavIcon icon={<Icon icon={CubeIcon} size="sm" />} />}
          menu={<ListItem label={m.sign_out()} onClick={handleSignOut} />}
          subheading={user?.email}
        />
      }
      resizable
    >
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
        <SideNavSection isHeaderHidden title="Admin">
          <SideNavItem icon={ShieldCheckIcon} label={m.nav_admin()}>
            <SideNavItem
              href="/admin/clusters"
              icon={Square3Stack3DIcon}
              isSelected={pathname.startsWith("/admin/clusters")}
              label={m.nav_clusters()}
            />
          </SideNavItem>
        </SideNavSection>
      ) : null}
    </SideNav>
  );
};

import { Icon } from "@astryxdesign/core/Icon";
import { ListItem } from "@astryxdesign/core/List";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import {
  CubeIcon,
  HomeIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";

import { useCurrentUser } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";

export const AuthedTopNav = () => {
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
    <TopNav
      label={m.product_name()}
      heading={
        <TopNavHeading
          heading={m.product_name()}
          logo={<NavIcon icon={<Icon icon={CubeIcon} size="sm" />} />}
          menu={<ListItem label={m.sign_out()} onClick={handleSignOut} />}
          subheading={user?.email}
        />
      }
      startContent={
        <>
          <TopNavItem
            href="/"
            icon={<Icon icon={HomeIcon} size="sm" />}
            isSelected={pathname === "/"}
            label={m.nav_dashboard()}
          />
          <TopNavItem
            href="/workloads"
            icon={<Icon icon={ServerStackIcon} size="sm" />}
            isSelected={pathname.startsWith("/workloads")}
            label={m.nav_workloads()}
          />
          {user?.role === "admin" ? (
            <TopNavItem
              href="/admin/clusters"
              icon={<Icon icon={ShieldCheckIcon} size="sm" />}
              isSelected={pathname.startsWith("/admin/clusters")}
              label={m.nav_admin()}
            />
          ) : null}
        </>
      }
    />
  );
};

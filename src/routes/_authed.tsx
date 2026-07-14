import { AppShell } from "@astryxdesign/core/AppShell";
import { Center } from "@astryxdesign/core/Center";
import { LinkProvider } from "@astryxdesign/core/Link";
import { ListItem } from "@astryxdesign/core/List";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Text } from "@astryxdesign/core/Text";
import {
  CubeIcon,
  HomeIcon,
  ServerStackIcon,
} from "@heroicons/react/24/outline";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { Authenticated, AuthLoading, useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { m } from "@/paraglide/messages";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    // Only redirect once we actually know the user is unauthenticated —
    // isLoading is briefly true on first load while the Convex auth
    // handshake resolves, and we don't want to bounce a logged-in user.
    if (!(context.auth.isLoading || context.auth.isAuthenticated)) {
      throw redirect({ search: { redirect: location.href }, to: "/sign-in" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <>
      <AuthLoading>
        <Center axis="both" style={{ minHeight: "100dvh" }}>
          <Text type="supporting">{m.loading()}</Text>
        </Center>
      </AuthLoading>
      <Authenticated>
        <LinkProvider component={Link}>
          <AppShell
            contentPadding={0}
            height="fill"
            sideNav={<AuthedSideNav />}
          >
            <Outlet />
          </AppShell>
        </LinkProvider>
      </Authenticated>
    </>
  );
}

function AuthedSideNav() {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const user = useQuery(api.auth.getCurrentUser);

  const handleSignOut = async () => {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/sign-in" });
  };

  return (
    <SideNav
      header={
        <SideNavHeading
          heading={m.product_name()}
          icon={
            <NavIcon icon={<CubeIcon style={{ height: 16, width: 16 }} />} />
          }
          menu={<ListItem label={m.sign_out()} onClick={handleSignOut} />}
          subheading={user?.email}
        />
      }
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
    </SideNav>
  );
}

import { Icon } from "@astryxdesign/core/Icon";
import { ListItem } from "@astryxdesign/core/List";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { CubeIcon } from "@heroicons/react/24/outline";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { useCurrentUser } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";

export const AuthedTopNav = () => {
  const router = useRouter();
  const navigate = useNavigate();
  const user = useCurrentUser();

  const handleSignOut = async () => {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/sign-in" });
  };

  return (
    <TopNav
      heading={
        <TopNavHeading
          heading={m.product_name()}
          logo={<NavIcon icon={<Icon icon={CubeIcon} size="sm" />} />}
          menu={<ListItem label={m.sign_out()} onClick={handleSignOut} />}
          subheading={user?.email}
        />
      }
      label={m.product_name()}
    />
  );
};

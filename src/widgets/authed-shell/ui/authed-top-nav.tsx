import { Avatar } from "@astryxdesign/core/Avatar";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { BellIcon } from "@heroicons/react/24/outline";
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
      endContent={
        <>
          <IconButton
            icon={<Icon icon={BellIcon} size="sm" />}
            isDisabled
            label={m.nav_notifications()}
            tooltip={m.nav_notifications()}
            variant="ghost"
          />
          <DropdownMenu
            button={{
              icon: <Avatar name={user?.email} size="small" />,
              isIconOnly: true,
              label: m.nav_account(),
              variant: "ghost",
            }}
            hasChevron={false}
            items={[{ label: m.sign_out(), onClick: handleSignOut }]}
          />
        </>
      }
      heading={
        <TopNavHeading
          heading={m.product_name()}
          logo={
            <NavIcon
              icon={
                <img
                  alt=""
                  src="/tabai-icon.svg"
                  style={{
                    height: "var(--spacing-4)",
                    width: "var(--spacing-4)",
                  }}
                />
              }
            />
          }
        />
      }
      label={m.product_name()}
    />
  );
};

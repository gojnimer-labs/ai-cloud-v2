import { Avatar } from "@astryxdesign/core/Avatar";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
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
          logo={
            <picture>
              <source
                media="(prefers-color-scheme: dark)"
                srcSet="/tabai-logo-full-dark.png"
              />
              <img
                alt={m.product_name()}
                src="/tabai-logo-full.png"
                style={{ height: "var(--spacing-8)", width: "auto" }}
              />
            </picture>
          }
        />
      }
      label={m.product_name()}
    />
  );
};

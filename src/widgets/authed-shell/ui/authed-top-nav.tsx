import { Avatar } from "@astryxdesign/core/Avatar";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useTheme } from "@astryxdesign/core/theme";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { BellIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { useCurrentUser } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { UserSettingsModal } from "@/widgets/user-settings-modal";

export const AuthedTopNav = () => {
  const user = useCurrentUser();
  const { mode } = useTheme();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
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
            <IconButton
              icon={<Avatar name={user?.email} size="small" />}
              label={m.settings_dialog_title()}
              onClick={() => setIsSettingsOpen(true)}
              tooltip={m.settings_dialog_title()}
              variant="ghost"
            />
          </>
        }
        heading={
          <TopNavHeading
            logo={
              <img
                alt={m.product_name()}
                src={
                  mode === "dark"
                    ? "/tabai-logo-full-dark.png"
                    : "/tabai-logo-full.png"
                }
                style={{ height: "var(--spacing-8)", width: "auto" }}
              />
            }
          />
        }
        label={m.product_name()}
      />
      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
};

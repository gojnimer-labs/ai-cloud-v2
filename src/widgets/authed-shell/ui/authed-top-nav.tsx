import { Avatar } from "@astryxdesign/core/Avatar";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useTheme } from "@astryxdesign/core/theme";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { getRouteApi } from "@tanstack/react-router";

import { NotificationBell } from "@/entities/notifications";
import { useCurrentUser } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { UserSettingsModal } from "@/widgets/user-settings-modal";

// getRouteApi (not useSearch/useNavigate directly) since this always
// renders under /_authed (see authed-shell.tsx), which is where the
// `settings` search param is declared — see routes/_authed.tsx.
const routeApi = getRouteApi("/_authed");

export const AuthedTopNav = () => {
  const user = useCurrentUser();
  const { mode } = useTheme();
  const { settings } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  return (
    <>
      <TopNav
        endContent={
          <>
            <NotificationBell />
            <IconButton
              icon={<Avatar name={user?.email} size="small" />}
              label={m.settings_dialog_title()}
              onClick={() =>
                navigate({ search: (prev) => ({ ...prev, settings: true }) })
              }
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
        isOpen={Boolean(settings)}
        onClose={() =>
          navigate({
            replace: true,
            search: (prev) => {
              const { settings: _settings, ...rest } = prev;
              return rest;
            },
          })
        }
      />
    </>
  );
};

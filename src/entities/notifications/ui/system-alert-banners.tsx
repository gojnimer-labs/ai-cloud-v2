import { Banner } from "@astryxdesign/core/Banner";
import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/Stack";

import { m } from "@/paraglide/messages";

import { useSystemAlerts } from "../model/use-system-alerts";
import { VARIANT_BANNER_STATUS } from "../model/variant";

// Admin- or system-posted alerts — a separate surface from the personal
// notification box (see convex/schema.ts's systemAlerts doc comment for why
// these can't just be per-user notification rows). A non-dismissable alert
// renders with no dismiss control at all, so it stays visible until
// retracted.
//
// topic scopes which alerts render here: omitted (default) renders the
// "global" app-shell banner mounted once in authed-shell.tsx; passing a
// specific topic (e.g. "system-fleet") mounts a second, independent set of
// banners on just that page — the seam a future cron job (e.g. a
// cluster-heartbeat monitor posting through
// convex/systemAlerts/mutations.ts#postSystemAlert) uses to surface an
// alert only where it's relevant, without it also showing up everywhere
// else.
export const SystemAlertBanners = ({ topic }: { topic?: string } = {}) => {
  const { alerts, dismiss } = useSystemAlerts(topic);

  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <VStack gap={0}>
      {alerts.map((alert) => (
        <Banner
          container="section"
          description={alert.body}
          endContent={
            alert.href ? (
              <Link href={alert.href}>{m.notifications_open_link()}</Link>
            ) : undefined
          }
          isDismissable={alert.isDismissable}
          key={alert._id}
          onDismiss={alert.isDismissable ? () => dismiss(alert._id) : undefined}
          status={VARIANT_BANNER_STATUS[alert.variant]}
          title={alert.title}
        />
      ))}
    </VStack>
  );
};

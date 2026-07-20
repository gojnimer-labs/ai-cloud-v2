import { Banner } from "@astryxdesign/core/Banner";
import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/Stack";

import { m } from "@/paraglide/messages";

import { useSystemAlerts } from "../model/use-system-alerts";
import { VARIANT_BANNER_STATUS } from "../model/variant";

// Global, admin-posted alerts — a separate surface from the personal
// notification box (see convex/schema.ts's systemAlerts doc comment for why
// these can't just be per-user notification rows). A non-dismissable alert
// renders with no dismiss control at all, so it stays visible until an admin
// retracts it.
export const SystemAlertBanners = () => {
  const { alerts, dismiss } = useSystemAlerts();

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

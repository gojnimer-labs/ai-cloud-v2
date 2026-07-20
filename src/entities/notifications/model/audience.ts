import { m } from "@/paraglide/messages";

// Mirrors convex/schema.ts's systemAlerts.audience union by hand — same
// frontend/backend duplication convention as variant.ts's
// NOTIFICATION_VARIANTS.
export const SYSTEM_ALERT_AUDIENCES = ["everyone", "admins"] as const;

export type SystemAlertAudience = (typeof SYSTEM_ALERT_AUDIENCES)[number];

export const audienceLabel = (audience: SystemAlertAudience): string =>
  audience === "admins"
    ? m.admin_notifications_audience_admins()
    : m.admin_notifications_audience_everyone();

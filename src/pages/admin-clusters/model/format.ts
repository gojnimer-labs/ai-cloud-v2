import { m } from "@/paraglide/messages";

import type { HealthStatus } from "./types";

export const healthStatusLabel = (status: HealthStatus): string => {
  if (status === "pending") {
    return m.admin_health_pending();
  }
  if (status === "healthy") {
    return m.admin_health_healthy();
  }
  if (status === "offline") {
    return m.admin_health_offline();
  }
  return m.admin_health_ready_to_destroy();
};

export const healthStatusVariant = (
  status: HealthStatus
): "neutral" | "success" | "warning" | "error" => {
  if (status === "pending") {
    return "neutral";
  }
  if (status === "healthy") {
    return "success";
  }
  if (status === "offline") {
    return "warning";
  }
  return "error";
};

export const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

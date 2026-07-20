export const formatNotificationTimestamp = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });

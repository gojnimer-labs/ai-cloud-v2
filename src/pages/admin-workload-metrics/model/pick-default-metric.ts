// Picks which metric the dashboard opens on. Outbound traffic (tx) is the
// more actionable default for an admin checking fleet load — prefer any
// reported metric name containing "tx" over the alphabetically-first one
// (which would otherwise favor "rx"), but still fall back to the first
// reported metric so this stays metric-agnostic for names that are neither
// (see convex/schema.ts's "deliberately metric-agnostic" comment on
// workloadMetrics) rather than assuming "tx" is always present.
export const pickDefaultMetric = (metricNames: string[]): string | null => {
  const txMetric = metricNames.find((name) => /tx/iu.test(name));
  return txMetric ?? metricNames[0] ?? null;
};

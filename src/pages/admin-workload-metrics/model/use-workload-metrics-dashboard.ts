import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";

import { TIME_RANGE_OPTIONS } from "./time-range";
import type { TimeRangeValue } from "./time-range";

export const useWorkloadMetricsDashboard = () => {
  const metricNames = useQuery(api.metrics.queries.listMetricNames);
  const [metric, setMetric] = useState<string | null>(null);
  const [rangeValue, setRangeValue] = useState<TimeRangeValue>("24h");

  // Date.now() can't be called directly during render (an impure call React
  // may re-invoke) — the lazy useState initializer runs it exactly once on
  // mount, and `refresh` (wired to a Reload button, the same convention the
  // astryx dashboard template itself uses) is the only other place it's
  // called, always from an event handler rather than render.
  const [endTime, setEndTime] = useState(() => Date.now());
  const refresh = () => setEndTime(Date.now());

  // Defaults to the first reported metric once the list loads, without
  // overriding a choice the admin already made.
  const selectedMetric = metric ?? metricNames?.[0] ?? null;
  const range =
    TIME_RANGE_OPTIONS.find((option) => option.value === rangeValue) ??
    TIME_RANGE_OPTIONS[0];

  const startTime = endTime - range.rangeMs;

  const summary = useQuery(
    api.metrics.queries.getWorkloadMetricsSummary,
    selectedMetric ? { endTime, metric: selectedMetric, startTime } : "skip"
  );
  const timeline = useQuery(
    api.metrics.queries.getWorkloadMetricsTimeline,
    selectedMetric
      ? { bucketMs: range.bucketMs, endTime, metric: selectedMetric, startTime }
      : "skip"
  );

  return {
    endTime,
    metricNames,
    range,
    rangeValue,
    refresh,
    selectedMetric,
    setMetric,
    setRangeValue,
    startTime,
    summary,
    timeline,
  };
};

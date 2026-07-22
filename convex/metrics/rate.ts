// Pure helpers for turning workloadMetrics' raw cumulative-counter samples
// (see convex/schema.ts#workloadMetrics) into rate-of-change contributions.
// No Convex imports — kept pure so the reset/bucketing logic (the fiddly
// part of this feature) is unit-testable without spinning up convex-test.

export interface MetricSample {
  sampledAt: number;
  value: number;
}

export interface MetricIncrease {
  // Timestamp of the LATER sample in the pair a delta was computed from —
  // a rate is conventionally attributed to the end of the interval it
  // measures, which is also what lets bucketing assign it deterministically.
  sampledAt: number;
  delta: number;
}

// Rate-of-change between consecutive samples of one workload+metric series.
// Handles counter resets (a workload restart resets the cumulative counter
// to a lower value, most often zero) the same way Prometheus' increase()
// does: a decrease is treated as a reset rather than a negative rate, so the
// delta becomes the new value itself instead of going negative.
export const computeIncreases = (samples: MetricSample[]): MetricIncrease[] => {
  const sorted = [...samples].toSorted((a, b) => a.sampledAt - b.sampledAt);
  const increases: MetricIncrease[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const delta =
      curr.value >= prev.value ? curr.value - prev.value : curr.value;
    increases.push({ delta, sampledAt: curr.sampledAt });
  }
  return increases;
};

// Total increase across a series within its own sample window. A lone
// sample contributes nothing (no prior point to diff against) — it only
// establishes the baseline for the next one, same as a windowed
// Prometheus increase() query.
export const sumIncrease = (samples: MetricSample[]): number =>
  computeIncreases(samples).reduce((sum, increase) => sum + increase.delta, 0);

// Sums increases into fixed-width time buckets, keyed by each bucket's
// start timestamp. Used to render a timeline chart independent of the raw
// (and typically irregular) sampling interval.
export const bucketIncreases = (
  samples: MetricSample[],
  bucketMs: number
): Map<number, number> => {
  const buckets = new Map<number, number>();
  for (const increase of computeIncreases(samples)) {
    const bucketStart = Math.floor(increase.sampledAt / bucketMs) * bucketMs;
    buckets.set(bucketStart, (buckets.get(bucketStart) ?? 0) + increase.delta);
  }
  return buckets;
};

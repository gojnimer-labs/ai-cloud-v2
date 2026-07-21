import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// The coarsest threshold that matters is OFFLINE_THRESHOLD_MS (3min,
// healthy -> offline - see operators/mutations.ts#computeHealthStatus for
// why that's tight rather than a coarse placeholder); 30s keeps status
// fresh enough that sweepStaleClaims' confirmed-offline fast path actually
// fires promptly, matching the same ~6x oversample ratio this file already
// uses below. Cheap regardless of cadence: a bounded, idempotent sweep that
// only writes rows whose computed status actually changed.
crons.interval(
  "promote cluster health statuses",
  { seconds: 30 },
  internal.operators.mutations.promoteHealthStatuses,
  {}
);

// ~5x oversample of the 10-min claim lease (see workloads/mutations.ts's
// CLAIM_TIMEOUT_MS), the same oversample ratio promoteHealthStatuses uses
// relative to its own coarsest (OFFLINE_THRESHOLD_MS) threshold.
crons.interval(
  "sweep stale workload claims",
  { minutes: 2 },
  internal.workloads.mutations.sweepStaleClaims,
  {}
);

export default crons;

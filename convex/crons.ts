import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// The coarsest threshold that matters is 1 hour (healthy -> offline); 10
// minutes keeps status reasonably fresh without excessive write churn on a
// fleet-sized table.
crons.interval(
  "promote cluster health statuses",
  { minutes: 10 },
  internal.operators.mutations.promoteHealthStatuses,
  {}
);

// ~5x oversample of the 10-min claim lease (see workloads/mutations.ts's
// CLAIM_TIMEOUT_MS), the same oversample ratio promoteHealthStatuses already
// uses relative to its own coarsest (1-hour) threshold.
crons.interval(
  "sweep stale workload claims",
  { minutes: 2 },
  internal.workloads.mutations.sweepStaleClaims,
  {}
);

export default crons;

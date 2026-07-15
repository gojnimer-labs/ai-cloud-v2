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

export default crons;

// ALL-must-match (subset) semantics: every tag the workload desires must be
// present on the candidate operator's own tags. An empty `desiredTags`
// matches any operator (nothing was asked for, so nothing filters it out).
//
// Used only by create's claim path (workloads/mutations.ts#claim,
// workloads/queries.ts#listClaimable) — destroy and redeploy act on an
// already-fixed `operatorId` and never need a tag check at all.
export const matchesTags = (
  operatorTags: string[] | undefined,
  desiredTags: string[]
): boolean => desiredTags.every((tag) => (operatorTags ?? []).includes(tag));

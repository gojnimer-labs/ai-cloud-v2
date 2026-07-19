import type { CatalogTemplate } from "./validators";

// Permissive by design in two cases: an operator that hasn't reported a
// catalog yet (hasn't re-registered under the operators.catalog contract —
// see convex/schema.ts's doc comment), and a workload with no captured
// templateVersion (legacy/backfilled rows — see workloads.templateVersion's
// own doc comment). Neither should block a claim that today's code would
// have allowed; the gate only activates once there's actually something to
// compare against.
//
// Used by create's claim path (workloads/mutations.ts#claim,
// workloads/queries.ts#listClaimable) and redeploy's claimOperation branch —
// mirrors tagMatch.ts's shape exactly, one predicate per concern.
export const supportsTemplateVersion = (
  catalog: CatalogTemplate[] | undefined,
  templateId: string,
  templateVersion: string | undefined
): boolean => {
  if (!catalog || !templateVersion) {
    return true;
  }
  return catalog.some(
    (template) =>
      template.id === templateId && template.version === templateVersion
  );
};

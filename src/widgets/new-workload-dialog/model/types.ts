import type { CatalogTemplate } from "@/entities/catalog-parameter";

// Mirrors convex/operators/queries.ts#listMergedCatalog's per-entry return
// shape — a CatalogTemplate plus which operators can serve it. The
// selection key in the New Workload dialog is `${id}@${version}` (matching
// listMergedCatalog's own dedup key), since two entries can share an id.
export interface MergedCatalogEntry extends CatalogTemplate {
  availableTags: string[];
  operatorCount: number;
}

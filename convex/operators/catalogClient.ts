import type { CatalogOperation, CatalogTemplate } from "./validators";

// Raw GET /catalog fetch — no dynamic-option resolution (that's
// getCatalog's job for the frontend-facing response). deployWorkload/
// runOperation only need each parameter's dataSource metadata, not its
// resolved options.
export const fetchCatalogTemplates = async (operator: {
  deployToken: string;
  externalUrl: string;
}): Promise<CatalogTemplate[]> => {
  const res = await fetch(`${operator.externalUrl}/catalog`, {
    headers: { Authorization: `Bearer ${operator.deployToken}` },
  });
  if (!res.ok) {
    throw new Error(`Catalog fetch failed: ${res.status}`);
  }
  return await res.json();
};

export const findTemplate = (
  templates: CatalogTemplate[],
  templateId: string
): CatalogTemplate | undefined => templates.find((t) => t.id === templateId);

export const findOperation = (
  template: CatalogTemplate,
  operationKey: string
): CatalogOperation | undefined =>
  template.operations?.find((op) => op.key === operationKey);

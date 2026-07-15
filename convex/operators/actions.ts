import { v } from "convex/values";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { authComponent } from "../auth";
import type { CatalogParameter, CatalogTemplate } from "./validators";
import { templateValidator } from "./validators";

// Resolves dataSource.kind === "dynamic" parameters' options against the
// generic selectOptions table (see convex/schema.ts) instead of the
// operator's static catalog — the operator declares a parameter needs a
// dynamic select and which sourceKey backs it, Convex is the one with
// database/credential access to actually resolve it, scoped to the
// requesting user. Adding a new dynamic select (e.g. "ssh_keys") needs no
// changes here, only rows with that sourceKey.
const collectSourceKeys = (templates: CatalogTemplate[]): Set<string> => {
  const sourceKeys = new Set<string>();
  const visit = (params: CatalogParameter[]) => {
    for (const param of params) {
      if (param.dataSource.kind === "dynamic") {
        sourceKeys.add(param.dataSource.sourceKey);
      }
    }
  };
  for (const template of templates) {
    visit(template.parameters);
    for (const operation of template.operations ?? []) {
      visit(operation.parameters);
    }
  }
  return sourceKeys;
};

const resolveParamOptions = (
  params: CatalogParameter[],
  optionsBySource: Map<string, { label: string; value: string }[]>
): CatalogParameter[] =>
  params.map((param) =>
    param.dataSource.kind === "dynamic"
      ? {
          ...param,
          options: optionsBySource.get(param.dataSource.sourceKey) ?? [],
        }
      : param
  );

// Resolves dynamic-select options for every parameter in the catalog — a
// template's own deploy-time parameters AND every operation's parameters,
// since either can declare a dynamic select the same way. Scoped to
// userId so one user's saved options never resolve into another user's
// dropdown.
const resolveDynamicOptions = async (
  ctx: ActionCtx,
  userId: string,
  templates: CatalogTemplate[]
): Promise<CatalogTemplate[]> => {
  const sourceKeys = collectSourceKeys(templates);
  if (sourceKeys.size === 0) {
    return templates;
  }

  const optionsBySource = new Map<string, { label: string; value: string }[]>();
  await Promise.all(
    [...sourceKeys].map(async (sourceKey) => {
      const rows = await ctx.runQuery(
        internal.selectOptions.queries.listBySource,
        { sourceKey, userId }
      );
      optionsBySource.set(
        sourceKey,
        rows.map((row) => ({ label: row.label, value: row._id }))
      );
    })
  );

  return templates.map((template) => ({
    ...template,
    operations: template.operations?.map((operation) => ({
      ...operation,
      parameters: resolveParamOptions(operation.parameters, optionsBySource),
    })),
    parameters: resolveParamOptions(template.parameters, optionsBySource),
  }));
};

// Proxies the operator's GET /catalog so the frontend can build a dynamic
// deploy form. The response includes system-sourced parameters (e.g.
// profileDownloadUrl) for transparency — the frontend is expected to only
// render dataSource.kind !== "system" parameters as inputs; deployWorkload
// always recomputes system values server-side regardless of what a client
// sends.
export const getCatalog = action({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args): Promise<CatalogTemplate[]> => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const operator: { deployToken: string; externalUrl: string } | null =
      await ctx.runQuery(internal.operators.queries.getForDeploy, {
        operatorId: args.operatorId,
      });
    if (!operator) {
      throw new Error("Operator not found");
    }

    const res = await fetch(`${operator.externalUrl}/catalog`, {
      headers: { Authorization: `Bearer ${operator.deployToken}` },
    });
    if (!res.ok) {
      throw new Error(`Catalog fetch failed: ${res.status}`);
    }

    const templates: CatalogTemplate[] = await res.json();
    return await resolveDynamicOptions(ctx, user._id, templates);
  },
  returns: v.array(templateValidator),
});

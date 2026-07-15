import { v } from "convex/values";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { authComponent } from "../auth";

const selectOptionValidator = v.object({
  label: v.string(),
  value: v.string(),
});

// Most types are a fixed enum, but a dynamic-select parameter's type is
// "select_<sourceKey>" (see resolveDynamicOptions below) — sourceKey is
// open-ended (new sources get added without a schema change here), so type
// stays a plain string rather than a closed union.
const parameterValidator = v.object({
  default: v.optional(v.any()),
  description: v.optional(v.string()),
  key: v.string(),
  label: v.string(),
  options: v.optional(v.array(selectOptionValidator)),
  required: v.boolean(),
  source: v.union(v.literal("user"), v.literal("system")),
  type: v.string(),
});

// A CustomFunction is a named operation a template exposes against an
// already-running workload (e.g. "backup_state" on firefox/chrome) —
// distinct from a template's own deploy-time parameters. Discovered the
// same way: it's part of the catalog response.
const customFunctionValidator = v.object({
  description: v.optional(v.string()),
  key: v.string(),
  label: v.string(),
  parameters: v.array(parameterValidator),
});

const templateValidator = v.object({
  customFunctions: v.optional(v.array(customFunctionValidator)),
  description: v.string(),
  icon: v.string(),
  id: v.string(),
  name: v.string(),
  parameters: v.array(parameterValidator),
});

type CatalogTemplate = typeof templateValidator.type;
type CatalogParameter = typeof parameterValidator.type;

// The reusable "select pattern": any catalog parameter whose type is
// "select_<sourceKey>" gets its options populated here, live, from the
// generic selectOptions table (see convex/schema.ts) instead of the
// operator's static catalog — the operator declares the parameter needs a
// dynamic select and which source backs it, Convex is the one with
// database/credential access to actually resolve it. Adding a new dynamic
// select (e.g. "select_ssh_keys") needs no changes here, only rows with that
// sourceKey.
const DYNAMIC_SELECT_PREFIX = "select_";

const sourceKeyFromType = (type: string): string | null =>
  type.startsWith(DYNAMIC_SELECT_PREFIX)
    ? type.slice(DYNAMIC_SELECT_PREFIX.length)
    : null;

const collectSourceKeys = (templates: CatalogTemplate[]): Set<string> => {
  const sourceKeys = new Set<string>();
  const visit = (params: CatalogParameter[]) => {
    for (const param of params) {
      const sourceKey = sourceKeyFromType(param.type);
      if (sourceKey) {
        sourceKeys.add(sourceKey);
      }
    }
  };
  for (const template of templates) {
    visit(template.parameters);
    for (const fn of template.customFunctions ?? []) {
      visit(fn.parameters);
    }
  }
  return sourceKeys;
};

const resolveParamOptions = (
  params: CatalogParameter[],
  optionsBySource: Map<string, { label: string; value: string }[]>
): CatalogParameter[] =>
  params.map((param) => {
    const sourceKey = sourceKeyFromType(param.type);
    if (!sourceKey) {
      return param;
    }
    return { ...param, options: optionsBySource.get(sourceKey) ?? [] };
  });

// Resolves select_<sourceKey> options for every parameter in the catalog —
// a template's own deploy-time parameters AND every customFunction's
// parameters, since either can declare a dynamic select the same way.
const resolveDynamicOptions = async (
  ctx: ActionCtx,
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
        { sourceKey }
      );
      optionsBySource.set(
        sourceKey,
        rows.map((row) => ({ label: row.label, value: row._id }))
      );
    })
  );

  return templates.map((template) => ({
    ...template,
    customFunctions: template.customFunctions?.map((fn) => ({
      ...fn,
      parameters: resolveParamOptions(fn.parameters, optionsBySource),
    })),
    parameters: resolveParamOptions(template.parameters, optionsBySource),
  }));
};

// Proxies the operator's GET /catalog so the frontend can build a dynamic
// deploy form. The response includes system-sourced parameters (e.g.
// profileDownloadUrl) for transparency — the frontend is expected to only
// render source:"user" parameters as inputs; deployWorkload always
// recomputes system values server-side regardless of what a client sends.
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
    return await resolveDynamicOptions(ctx, templates);
  },
  returns: v.array(templateValidator),
});

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { authedAction } from "../functions";
import { fetchCatalogTemplates } from "./catalogClient";
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

// Resolves dataSource.kind === "fileOptions" parameters' options against
// the files table (see convex/schema.ts) — the files-table counterpart to
// resolveDynamicOptions/selectOptions above. Kept as a separate function
// rather than merged into resolveDynamicOptions: the two backing tables
// serve genuinely different needs (a file's identity is more than a bare
// label), and merging them into one abstraction now would be speculative.
const collectGroups = (templates: CatalogTemplate[]): Set<string> => {
  const groups = new Set<string>();
  const visit = (params: CatalogParameter[]) => {
    for (const param of params) {
      if (param.dataSource.kind === "fileOptions") {
        groups.add(param.dataSource.group);
      }
    }
  };
  for (const template of templates) {
    visit(template.parameters);
    for (const operation of template.operations ?? []) {
      visit(operation.parameters);
    }
  }
  return groups;
};

const resolveFileParamOptions = (
  params: CatalogParameter[],
  optionsByGroup: Map<string, { label: string; value: string }[]>
): CatalogParameter[] =>
  params.map((param) =>
    param.dataSource.kind === "fileOptions"
      ? { ...param, options: optionsByGroup.get(param.dataSource.group) ?? [] }
      : param
  );

const resolveFileOptions = async (
  ctx: ActionCtx,
  userId: string,
  templates: CatalogTemplate[]
): Promise<CatalogTemplate[]> => {
  const groups = collectGroups(templates);
  if (groups.size === 0) {
    return templates;
  }

  const optionsByGroup = new Map<string, { label: string; value: string }[]>();
  await Promise.all(
    [...groups].map(async (group) => {
      const rows = await ctx.runQuery(internal.files.queries.listByGroup, {
        group,
        userId,
      });
      optionsByGroup.set(
        group,
        rows.map((row) => ({ label: row.label, value: row._id }))
      );
    })
  );

  return templates.map((template) => ({
    ...template,
    operations: template.operations?.map((operation) => ({
      ...operation,
      parameters: resolveFileParamOptions(operation.parameters, optionsByGroup),
    })),
    parameters: resolveFileParamOptions(template.parameters, optionsByGroup),
  }));
};

// Proxies the operator's GET /catalog so the frontend can build a dynamic
// deploy form. The response includes system-sourced parameters (e.g.
// profileDownloadUrl) for transparency — the frontend is expected to only
// render dataSource.kind !== "system" parameters as inputs; deployWorkload
// always recomputes system values server-side regardless of what a client
// sends.
export const getCatalog = authedAction({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args): Promise<CatalogTemplate[]> => {
    const operator: { deployToken: string; externalUrl: string } | null =
      await ctx.runQuery(internal.operators.queries.getForDeploy, {
        operatorId: args.operatorId,
      });
    if (!operator) {
      throw new Error("Operator not found");
    }

    const templates = await fetchCatalogTemplates(operator);
    const withDynamicOptions = await resolveDynamicOptions(
      ctx,
      ctx.user._id,
      templates
    );
    return await resolveFileOptions(ctx, ctx.user._id, withDynamicOptions);
  },
  returns: v.array(templateValidator),
});

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { authedAction } from "../functions";
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
export const resolveDynamicOptions = async (
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

export const resolveFileOptions = async (
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

// Used by convex/workloads/actions.ts#adminGetCatalog, scoped to the target
// workload's owner instead of the calling admin — an admin has no
// selectOptions/files of their own worth resolving dynamic/fileOptions
// parameters against. Looks up the one template the workload actually uses
// out of the operator's self-reported catalog (via
// operators/queries.ts#getOperatorCatalogTemplate) rather than a live
// per-operator HTTP fetch — mirrors resolveMergedTemplate below, just
// scoped to an already-known operatorId instead of a cross-operator
// id+version search. Returns an empty array (not an error) when the
// operator/template can't be found — adminGetCatalog's own array-search
// callers already treat "not present" as "nothing to show".
export const fetchResolvedCatalog = async (
  ctx: ActionCtx,
  operatorId: Id<"operators">,
  templateId: string,
  userId: string
): Promise<CatalogTemplate[]> => {
  const template = await ctx.runQuery(
    internal.operators.queries.getOperatorCatalogTemplate,
    { operatorId, templateId }
  );
  if (!template) {
    return [];
  }

  const [withDynamicOptions] = await resolveDynamicOptions(ctx, userId, [
    template,
  ]);
  return await resolveFileOptions(ctx, userId, [withDynamicOptions]);
};

// Resolves dynamic/fileOptions parameter options for a single template the
// user selected from listMergedCatalog (step 1 of the New Workload dialog)
// — reuses resolveDynamicOptions/resolveFileOptions exactly as
// fetchResolvedCatalog does, but against Convex's own self-reported
// operator.catalog data (via getTemplateByIdAndVersion) instead of a live
// per-operator HTTP fetch. This is deliberate: which operator eventually
// serves this exact templateId+templateVersion is resolved later, at
// requestWorkload time (operators/queries.ts#getRepresentativeForTags) —
// resolveDynamicOptions/resolveFileOptions have no operator-specific
// behavior at all, so there's no need to (and no correct way to) pick an
// operator just to render this form.
export const resolveMergedTemplate = authedAction({
  args: { templateId: v.string(), templateVersion: v.string() },
  handler: async (ctx, args): Promise<CatalogTemplate | null> => {
    const template = await ctx.runQuery(
      internal.operators.queries.getTemplateByIdAndVersion,
      { templateId: args.templateId, templateVersion: args.templateVersion }
    );
    if (!template) {
      return null;
    }
    const [withDynamicOptions] = await resolveDynamicOptions(
      ctx,
      ctx.user._id,
      [template]
    );
    const [resolved] = await resolveFileOptions(ctx, ctx.user._id, [
      withDynamicOptions,
    ]);
    return resolved;
  },
  returns: v.union(templateValidator, v.null()),
});

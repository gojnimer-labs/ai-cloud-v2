import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  prepareSelectOptionUpload,
  resolveSelectOption,
} from "../selectOptions/handlers";
import type { SelectOptionPayload } from "../selectOptions/validators";
import type { CatalogParameter } from "./validators";

interface HandlerParamResolverArgs {
  rawParams: Record<string, unknown>;
  templateId: string;
  userId: string;
}

interface HandlerParamResolution {
  paramValue: unknown;
  // Only ever set by the "upload" resolver — what a matching insert_row
  // directive should be able to look up afterward (see
  // selectOptions/handlers.ts#prepareSelectOptionUpload).
  prepared?: { handler: string; payload: SelectOptionPayload };
}

type HandlerParamResolver = (
  ctx: ActionCtx,
  param: CatalogParameter,
  args: HandlerParamResolverArgs
) => Promise<HandlerParamResolution>;

// One resolver per DataSource.direction — the same named-handler-map
// pattern as selectOptions/handlers.ts's HANDLERS and rowDirectives/
// registry.ts's TARGETS, instead of an if/else chain on `direction`.
const DIRECTION_RESOLVERS: Record<"download" | "upload", HandlerParamResolver> =
  {
    download: async (ctx, param, { rawParams, userId }) => {
      if (param.dataSource.kind !== "file") {
        return { paramValue: undefined };
      }
      // The source parameter's value is a row id (see the per-template
      // "profiles_firefox"/"profiles_chrome" dynamic-select sources in
      // ai-cloud-operator's browser.go), not a literal value — resolve it
      // back to whatever resolveSelectOption's handler produces. A
      // stale/deleted option (row gone, malformed id, or no payload yet) is
      // treated as "nothing to restore" rather than failing the caller — the
      // source value ultimately comes from client-supplied JSON, so it isn't
      // guaranteed to be a well-formed row id.
      const sourceValue = rawParams[param.dataSource.sourceParam ?? ""];
      if (typeof sourceValue !== "string" || sourceValue.length === 0) {
        return { paramValue: undefined };
      }
      const option = await ctx
        .runQuery(internal.selectOptions.queries.get, {
          id: sourceValue as Id<"selectOptions">,
          userId,
        })
        .catch(() => null);
      const paramValue =
        (await resolveSelectOption(
          param.dataSource.handler,
          option?.payload
        )) ?? undefined;
      return { paramValue };
    },
    upload: async (_ctx, param, { templateId, userId }) => {
      if (param.dataSource.kind !== "file") {
        return { paramValue: undefined };
      }
      const { paramValue, payload } = await prepareSelectOptionUpload(
        param.dataSource.handler,
        {
          templateId,
          userId,
        }
      );
      return {
        paramValue,
        prepared: { handler: param.dataSource.handler, payload },
      };
    },
  };

// Resolves every handler-backed parameter in `parameters` — used by both
// deployWorkload (download-direction params) and runOperation
// (upload-direction params) so the "walk the catalog's handler-backed
// params generically" logic exists exactly once.
//
// "file" is the only DataSourceKind that carries a handler/direction today
// (see catalog.DataSource in ai-cloud-operator) — that's a property of
// today's schema, not something this function's name/logic should assume:
// the actual dispatch is keyed by `direction`, not by `kind`, so a future
// DataSourceKind gaining its own handler/direction would only need a new
// case in DIRECTION_RESOLVERS (or a widened kind check below), not a new
// parallel copy of this function. Which direction a param needs and which
// handler resolves it both come from the catalog itself — this has no
// template-, operation-, or param-name-specific knowledge at all.
export const resolveHandlerParams = async (
  ctx: ActionCtx,
  parameters: CatalogParameter[],
  args: HandlerParamResolverArgs
): Promise<({ key: string } & HandlerParamResolution)[]> => {
  const resolved = await Promise.all(
    parameters.map(async (param) => {
      if (param.dataSource.kind !== "file") {
        return null;
      }
      const resolution = await DIRECTION_RESOLVERS[param.dataSource.direction](
        ctx,
        param,
        args
      );
      return { key: param.key, ...resolution };
    })
  );
  return resolved.filter(
    (entry): entry is Exclude<typeof entry, null> => entry !== null
  );
};

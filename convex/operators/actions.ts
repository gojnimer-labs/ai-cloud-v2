import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { authComponent } from "../auth";

const selectOptionValidator = v.object({
  label: v.string(),
  value: v.string(),
});

const parameterValidator = v.object({
  default: v.optional(v.any()),
  description: v.optional(v.string()),
  key: v.string(),
  label: v.string(),
  options: v.optional(v.array(selectOptionValidator)),
  required: v.boolean(),
  source: v.union(v.literal("user"), v.literal("system")),
  type: v.union(
    v.literal("string"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("select")
  ),
});

const templateValidator = v.object({
  description: v.string(),
  icon: v.string(),
  id: v.string(),
  name: v.string(),
  parameters: v.array(parameterValidator),
});

// Proxies the operator's GET /catalog so the frontend can build a dynamic
// deploy form. The response includes system-sourced parameters (e.g.
// profileDownloadUrl) for transparency — the frontend is expected to only
// render source:"user" parameters as inputs; deployWorkload always
// recomputes system values server-side regardless of what a client sends.
export const getCatalog = action({
  args: { operatorId: v.id("operators") },
  handler: async (ctx, args): Promise<(typeof templateValidator.type)[]> => {
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
    return await res.json();
  },
  returns: v.array(templateValidator),
});

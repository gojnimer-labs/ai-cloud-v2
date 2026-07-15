import { registerStaticRoutes } from "@convex-dev/static-hosting";
import type { HonoWithConvex } from "convex-helpers/server/hono";
import { HttpRouterWithHono } from "convex-helpers/server/hono";
import { Hono } from "hono";

import { components } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import type { OperatorEnv } from "./operators/http";
import { registerOperatorRoutes } from "./operators/http";

const app: HonoWithConvex<ActionCtx, OperatorEnv["Variables"]> =
  new Hono<OperatorEnv>();

registerOperatorRoutes(app);

const http = new HttpRouterWithHono(app);

// Better Auth's routes are exact paths (/api/auth/...); HttpRouterWithHono's
// lookup() always checks traditional http.route()-registered paths (this
// call and the static-hosting catch-all below) BEFORE falling back to Hono
// routes, so registration order relative to the operator routes above
// doesn't matter.
authComponent.registerRoutes(http, createAuth, { cors: true });

// Serve static files at root with SPA fallback. Only ever registers GET
// routes, so it never shadows the operators' POST-only Hono routes above.
registerStaticRoutes(http, components.selfHosting);

export default http;

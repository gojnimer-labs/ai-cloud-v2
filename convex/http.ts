import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import {
  heartbeat,
  register,
  removeWorkload,
  upsertWorkload,
  verifyGatewayToken,
} from "./operators/http";

const http = httpRouter();

// Better Auth's routes are exact paths (/api/auth/...), so they take
// priority over the static-hosting catch-all below regardless of order.
authComponent.registerRoutes(http, createAuth, { cors: true });

// ai-cloud-operator registration/heartbeat/workload-lifecycle — also exact
// paths, so ordering relative to the static-hosting catch-all below doesn't
// matter.
http.route({ handler: register, method: "POST", path: "/operators/register" });
http.route({
  handler: heartbeat,
  method: "POST",
  path: "/operators/heartbeat",
});
http.route({
  handler: upsertWorkload,
  method: "POST",
  path: "/operators/workloads/upsert",
});
http.route({
  handler: removeWorkload,
  method: "POST",
  path: "/operators/workloads/remove",
});
http.route({
  handler: verifyGatewayToken,
  method: "POST",
  path: "/operators/gateway/verify",
});

// Serve static files at root with SPA fallback
registerStaticRoutes(http, components.selfHosting);

export default http;

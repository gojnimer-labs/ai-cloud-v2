import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Better Auth's routes are exact paths (/api/auth/...), so they take
// priority over the static-hosting catch-all below regardless of order.
authComponent.registerRoutes(http, createAuth, { cors: true });

// Serve static files at root with SPA fallback
registerStaticRoutes(http, components.selfHosting);

export default http;

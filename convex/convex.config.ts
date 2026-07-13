import betterAuth from "@convex-dev/better-auth/convex.config";
import selfHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(selfHosting);
app.use(betterAuth);

export default app;

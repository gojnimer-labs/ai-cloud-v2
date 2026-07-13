import betterAuth from "@convex-dev/better-auth/convex.config";
import r2 from "@convex-dev/r2/convex.config";
import selfHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(selfHosting);
app.use(betterAuth);
app.use(r2);

export default app;

import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

import { env } from "./_generated/server";

// jwks is undefined until the Static JWKS setup (convex/auth.ts#getLatestJwks)
// has been run once — see the comment there. Until then this falls back to
// the live `/api/auth/convex/jwks` URL, identical to today's behavior.
export default {
  providers: [getAuthConfigProvider({ jwks: env.JWKS })],
} satisfies AuthConfig;

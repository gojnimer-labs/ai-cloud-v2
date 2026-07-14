import { createAuth } from "../auth";

// Static instance used only for Better Auth schema generation
// (`npx @better-auth/cli generate`), per the local-install pattern:
// https://labs.convex.dev/better-auth/features/local-install
// biome-ignore lint/suspicious/noExplicitAny: Pattern from betterAuth docs
export const auth = createAuth({} as any);

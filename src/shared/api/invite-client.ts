import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { inviteClient } from "better-invite";

// A separate, narrowly-typed client for better-invite's endpoints, rather
// than folding inviteClient() into the main `authClient` (auth-client.ts).
//
// Two reasons:
// - better-invite's precise client type embeds its own (unexported)
//   InviteType/InviteTypeWithId types, which this project's composite
//   build (tsc -b) can't print into a declaration file (TS2883) — the
//   package's "exports" map only exposes dist/index.d.mts, not the
//   dist/types.d.mts module those types actually live in.
// - Casting just the inviteClient() plugin to erase that type broke
//   `authClient`'s session/user typing entirely (createAuthClient's
//   cross-plugin type merging collapses to `never` once one plugin in the
//   tuple isn't a precise literal type).
//
// Hand-typed instead, scoped to just the endpoints this app calls: invite
// creation (admin-users page) and activation (the public /invite/:token
// flow). Response shapes are taken directly from better-invite's route
// source (node_modules/better-invite/dist/routes/*.mjs), not guessed.
type InviteRole = "user" | "admin";

interface InviteAuthClient {
  invite: {
    create: (args: { role: InviteRole }) => Promise<{
      data: { status: boolean; message: string } | null;
      error: { message?: string } | null;
    }>;
    activate: (args: { token: string; callbackURL?: string }) => Promise<{
      data: {
        status: boolean;
        message: string;
        action?: string;
        redirectTo?: string;
      } | null;
      error: { message?: string } | null;
    }>;
  };
}

export const inviteAuthClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [crossDomainClient(), convexClient(), inviteClient()],
}) as unknown as InviteAuthClient;

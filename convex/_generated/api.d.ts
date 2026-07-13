/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as gateway_token from "../gateway/token.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as operators_actions from "../operators/actions.js";
import type * as operators_crypto from "../operators/crypto.js";
import type * as operators_http from "../operators/http.js";
import type * as operators_mutations from "../operators/mutations.js";
import type * as operators_queries from "../operators/queries.js";
import type * as staticHosting from "../staticHosting.js";
import type * as storage_r2 from "../storage/r2.js";
import type * as workloads_actions from "../workloads/actions.js";
import type * as workloads_mutations from "../workloads/mutations.js";
import type * as workloads_queries from "../workloads/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "gateway/token": typeof gateway_token;
  http: typeof http;
  messages: typeof messages;
  "operators/actions": typeof operators_actions;
  "operators/crypto": typeof operators_crypto;
  "operators/http": typeof operators_http;
  "operators/mutations": typeof operators_mutations;
  "operators/queries": typeof operators_queries;
  staticHosting: typeof staticHosting;
  "storage/r2": typeof storage_r2;
  "workloads/actions": typeof workloads_actions;
  "workloads/mutations": typeof workloads_mutations;
  "workloads/queries": typeof workloads_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  selfHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"selfHosting">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};

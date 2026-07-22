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
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as files_mutations from "../files/mutations.js";
import type * as files_queries from "../files/queries.js";
import type * as functions from "../functions.js";
import type * as groups_mutations from "../groups/mutations.js";
import type * as groups_queries from "../groups/queries.js";
import type * as http from "../http.js";
import type * as invites_mutations from "../invites/mutations.js";
import type * as invites_queries from "../invites/queries.js";
import type * as lib_errors from "../lib/errors.js";
import type * as metrics_mutations from "../metrics/mutations.js";
import type * as metrics_queries from "../metrics/queries.js";
import type * as metrics_rate from "../metrics/rate.js";
import type * as migrations from "../migrations.js";
import type * as notifications_actions from "../notifications/actions.js";
import type * as notifications_client from "../notifications/client.js";
import type * as notifications_mutations from "../notifications/mutations.js";
import type * as notifications_queries from "../notifications/queries.js";
import type * as operators_actions from "../operators/actions.js";
import type * as operators_catalogMatch from "../operators/catalogMatch.js";
import type * as operators_crypto from "../operators/crypto.js";
import type * as operators_fileParams from "../operators/fileParams.js";
import type * as operators_http from "../operators/http.js";
import type * as operators_mutations from "../operators/mutations.js";
import type * as operators_queries from "../operators/queries.js";
import type * as operators_tagMatch from "../operators/tagMatch.js";
import type * as operators_validators from "../operators/validators.js";
import type * as presets_actions from "../presets/actions.js";
import type * as presets_mutations from "../presets/mutations.js";
import type * as presets_permissions from "../presets/permissions.js";
import type * as presets_queries from "../presets/queries.js";
import type * as presets_versioning from "../presets/versioning.js";
import type * as selectOptions_queries from "../selectOptions/queries.js";
import type * as staticHosting from "../staticHosting.js";
import type * as storage_r2 from "../storage/r2.js";
import type * as storage_r2Client from "../storage/r2Client.js";
import type * as systemAlerts_mutations from "../systemAlerts/mutations.js";
import type * as systemAlerts_queries from "../systemAlerts/queries.js";
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
  crons: typeof crons;
  email: typeof email;
  "files/mutations": typeof files_mutations;
  "files/queries": typeof files_queries;
  functions: typeof functions;
  "groups/mutations": typeof groups_mutations;
  "groups/queries": typeof groups_queries;
  http: typeof http;
  "invites/mutations": typeof invites_mutations;
  "invites/queries": typeof invites_queries;
  "lib/errors": typeof lib_errors;
  "metrics/mutations": typeof metrics_mutations;
  "metrics/queries": typeof metrics_queries;
  "metrics/rate": typeof metrics_rate;
  migrations: typeof migrations;
  "notifications/actions": typeof notifications_actions;
  "notifications/client": typeof notifications_client;
  "notifications/mutations": typeof notifications_mutations;
  "notifications/queries": typeof notifications_queries;
  "operators/actions": typeof operators_actions;
  "operators/catalogMatch": typeof operators_catalogMatch;
  "operators/crypto": typeof operators_crypto;
  "operators/fileParams": typeof operators_fileParams;
  "operators/http": typeof operators_http;
  "operators/mutations": typeof operators_mutations;
  "operators/queries": typeof operators_queries;
  "operators/tagMatch": typeof operators_tagMatch;
  "operators/validators": typeof operators_validators;
  "presets/actions": typeof presets_actions;
  "presets/mutations": typeof presets_mutations;
  "presets/permissions": typeof presets_permissions;
  "presets/queries": typeof presets_queries;
  "presets/versioning": typeof presets_versioning;
  "selectOptions/queries": typeof selectOptions_queries;
  staticHosting: typeof staticHosting;
  "storage/r2": typeof storage_r2;
  "storage/r2Client": typeof storage_r2Client;
  "systemAlerts/mutations": typeof systemAlerts_mutations;
  "systemAlerts/queries": typeof systemAlerts_queries;
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
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  notification: import("convex-notification/_generated/component.js").ComponentApi<"notification">;
};

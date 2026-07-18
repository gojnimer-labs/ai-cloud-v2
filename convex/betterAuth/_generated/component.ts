/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId: string;
                  createdAt: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt: number;
                  userId: string;
                };
                model: "account";
              }
            | {
                data: {
                  createdAt?: null | number;
                  createdByUserId?: null | string;
                  email?: null | string;
                  emails?: null | Array<string>;
                  expiresAt: number;
                  infinityMaxUses: boolean;
                  maxUses: number;
                  newAccount?: null | boolean;
                  redirectToAfterUpgrade?: null | string;
                  role: string;
                  shareInviterName: boolean;
                  status: "pending" | "rejected" | "canceled" | "used";
                  token?: null | string;
                };
                model: "invite";
              }
            | {
                data: {
                  inviteId: string;
                  usedAt: number;
                  usedByUserId?: null | string;
                };
                model: "inviteUse";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt?: null | number;
                  privateKey: string;
                  publicKey: string;
                };
                model: "jwks";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  impersonatedBy?: null | string;
                  ipAddress?: null | string;
                  token: string;
                  updatedAt: number;
                  userAgent?: null | string;
                  userId: string;
                };
                model: "session";
              }
            | {
                data: {
                  banExpires?: null | number;
                  banReason?: null | string;
                  banned?: null | boolean;
                  createdAt: number;
                  email: string;
                  emailVerified: boolean;
                  image?: null | string;
                  name: string;
                  role?: null | string;
                  updatedAt: number;
                  userId?: null | string;
                };
                model: "user";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  identifier: string;
                  updatedAt: number;
                  value: string;
                };
                model: "verification";
              };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any,
        Name
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "accessTokenExpiresAt"
                    | "accountId"
                    | "createdAt"
                    | "idToken"
                    | "password"
                    | "providerId"
                    | "refreshToken"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "updatedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invite";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "createdByUserId"
                    | "email"
                    | "emails"
                    | "expiresAt"
                    | "infinityMaxUses"
                    | "maxUses"
                    | "newAccount"
                    | "redirectToAfterUpgrade"
                    | "role"
                    | "shareInviterName"
                    | "status"
                    | "token"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "inviteUse";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "inviteId" | "usedAt" | "usedByUserId" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "privateKey"
                    | "publicKey"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "impersonatedBy"
                    | "ipAddress"
                    | "token"
                    | "updatedAt"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "banExpires"
                    | "banReason"
                    | "banned"
                    | "createdAt"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "name"
                    | "role"
                    | "updatedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "identifier"
                    | "updatedAt"
                    | "value"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "accessTokenExpiresAt"
                    | "accountId"
                    | "createdAt"
                    | "idToken"
                    | "password"
                    | "providerId"
                    | "refreshToken"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "updatedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invite";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "createdByUserId"
                    | "email"
                    | "emails"
                    | "expiresAt"
                    | "infinityMaxUses"
                    | "maxUses"
                    | "newAccount"
                    | "redirectToAfterUpgrade"
                    | "role"
                    | "shareInviterName"
                    | "status"
                    | "token"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "inviteUse";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "inviteId" | "usedAt" | "usedByUserId" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "privateKey"
                    | "publicKey"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "impersonatedBy"
                    | "ipAddress"
                    | "token"
                    | "updatedAt"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "banExpires"
                    | "banReason"
                    | "banned"
                    | "createdAt"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "name"
                    | "role"
                    | "updatedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "identifier"
                    | "updatedAt"
                    | "value"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
        },
        any,
        Name
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          limit?: number;
          model:
            | "account"
            | "invite"
            | "inviteUse"
            | "jwks"
            | "session"
            | "user"
            | "verification";
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          select?: Array<string>;
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            mode?: "sensitive" | "insensitive";
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              string | number | boolean | Array<string> | Array<number> | null;
          }>;
        },
        any,
        Name
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          model:
            | "account"
            | "invite"
            | "inviteUse"
            | "jwks"
            | "session"
            | "user"
            | "verification";
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            mode?: "sensitive" | "insensitive";
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              string | number | boolean | Array<string> | Array<number> | null;
          }>;
        },
        any,
        Name
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "accessTokenExpiresAt"
                    | "accountId"
                    | "createdAt"
                    | "idToken"
                    | "password"
                    | "providerId"
                    | "refreshToken"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "updatedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invite";
                update: {
                  createdAt?: null | number;
                  createdByUserId?: null | string;
                  email?: null | string;
                  emails?: null | Array<string>;
                  expiresAt?: number;
                  infinityMaxUses?: boolean;
                  maxUses?: number;
                  newAccount?: null | boolean;
                  redirectToAfterUpgrade?: null | string;
                  role?: string;
                  shareInviterName?: boolean;
                  status?: "pending" | "rejected" | "canceled" | "used";
                  token?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "createdByUserId"
                    | "email"
                    | "emails"
                    | "expiresAt"
                    | "infinityMaxUses"
                    | "maxUses"
                    | "newAccount"
                    | "redirectToAfterUpgrade"
                    | "role"
                    | "shareInviterName"
                    | "status"
                    | "token"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "inviteUse";
                update: {
                  inviteId?: string;
                  usedAt?: number;
                  usedByUserId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "inviteId" | "usedAt" | "usedByUserId" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  expiresAt?: null | number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "privateKey"
                    | "publicKey"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  impersonatedBy?: null | string;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "impersonatedBy"
                    | "ipAddress"
                    | "token"
                    | "updatedAt"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "user";
                update: {
                  banExpires?: null | number;
                  banReason?: null | string;
                  banned?: null | boolean;
                  createdAt?: number;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  name?: string;
                  role?: null | string;
                  updatedAt?: number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "banExpires"
                    | "banReason"
                    | "banned"
                    | "createdAt"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "name"
                    | "role"
                    | "updatedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "identifier"
                    | "updatedAt"
                    | "value"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any,
        Name
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "accessTokenExpiresAt"
                    | "accountId"
                    | "createdAt"
                    | "idToken"
                    | "password"
                    | "providerId"
                    | "refreshToken"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "updatedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invite";
                update: {
                  createdAt?: null | number;
                  createdByUserId?: null | string;
                  email?: null | string;
                  emails?: null | Array<string>;
                  expiresAt?: number;
                  infinityMaxUses?: boolean;
                  maxUses?: number;
                  newAccount?: null | boolean;
                  redirectToAfterUpgrade?: null | string;
                  role?: string;
                  shareInviterName?: boolean;
                  status?: "pending" | "rejected" | "canceled" | "used";
                  token?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "createdByUserId"
                    | "email"
                    | "emails"
                    | "expiresAt"
                    | "infinityMaxUses"
                    | "maxUses"
                    | "newAccount"
                    | "redirectToAfterUpgrade"
                    | "role"
                    | "shareInviterName"
                    | "status"
                    | "token"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "inviteUse";
                update: {
                  inviteId?: string;
                  usedAt?: number;
                  usedByUserId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "inviteId" | "usedAt" | "usedByUserId" | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  expiresAt?: null | number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "privateKey"
                    | "publicKey"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  impersonatedBy?: null | string;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "impersonatedBy"
                    | "ipAddress"
                    | "token"
                    | "updatedAt"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "user";
                update: {
                  banExpires?: null | number;
                  banReason?: null | string;
                  banned?: null | boolean;
                  createdAt?: number;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  name?: string;
                  role?: null | string;
                  updatedAt?: number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "banExpires"
                    | "banReason"
                    | "banned"
                    | "createdAt"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "name"
                    | "role"
                    | "updatedAt"
                    | "userId"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "createdAt"
                    | "expiresAt"
                    | "identifier"
                    | "updatedAt"
                    | "value"
                    | "_id";
                  mode?: "sensitive" | "insensitive";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
        },
        any,
        Name
      >;
    };
  };

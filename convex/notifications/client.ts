import type { GenericCtx } from "@convex-dev/better-auth";
import { defineNotifications } from "convex-notification";
import { makeNotificationAPI } from "convex-notification/server";
import { v } from "convex/values";

import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { authComponent } from "../auth";
import { appError } from "../lib/errors";
import { notificationVariantValidator } from "../schema";

// One kind covers every admin-composed send (specific user, group broadcast,
// broadcast to everyone) — they differ only in which targetId(s) the send
// resolves to, not in payload shape, so a single kind avoids a redundant
// per-target-mode discriminator. Global system alerts (persistent banners
// that must also reach future signups) are a separate, non-package-backed
// concept — see convex/systemAlerts/.
export const notifications = defineNotifications(components.notification, {
  defaultListLimit: 50,
  kinds: {
    admin_message: v.object({
      body: v.optional(v.string()),
      href: v.optional(v.string()),
      title: v.string(),
      variant: notificationVariantValidator,
    }),
  },
});

// Self-serve inbox API for the currently authenticated user's own
// notifications — built here (not in queries.ts/mutations.ts) so
// queries.ts/mutations.ts just re-export the pieces they own from this
// single object.
export const selfNotificationAPI = makeNotificationAPI(notifications, {
  resolveTargetId: async (ctx) => {
    // The package types resolveTargetId's ctx against its own unparameterized
    // GenericDataModel, not this app's schema — at runtime it's the real app
    // ctx (same object a query/mutation handler gets), so this cast just
    // restores the type authComponent.safeGetAuthUser actually needs.
    const user = await authComponent.safeGetAuthUser(
      ctx as GenericCtx<DataModel>
    );
    if (!user) {
      throw appError("auth.not_authenticated");
    }
    return user._id;
  },
});

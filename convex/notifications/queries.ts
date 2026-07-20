import { selfNotificationAPI } from "./client";

// Self-serve inbox reads for the currently authenticated user — re-exported
// as-is from the shared makeNotificationAPI object (see client.ts's doc
// comment). This module is the boundary every caller (frontend, other
// convex/ code) imports through, never the component directly — if
// convex-notification is ever ejected, only client.ts's internals change.
export const { list, listPage, counts, unseenCount } = selfNotificationAPI;

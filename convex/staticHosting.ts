import {
  exposeDeploymentQuery,
  exposeUploadApi,
} from "@convex-dev/static-hosting";

import { components } from "./_generated/api";

// Internal functions for secure uploads (CLI only)
export const {
  generateUploadUrl,
  generateUploadUrls,
  recordAsset,
  recordAssets,
  gcOldAssets,
  listAssets,
} = exposeUploadApi(components.selfHosting);

// Public query for live reload notifications
export const { getCurrentDeployment } = exposeDeploymentQuery(
  components.selfHosting
);

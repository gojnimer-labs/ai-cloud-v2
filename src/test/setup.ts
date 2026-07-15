import { afterEach } from "vitest";
import { resetAuthClientMock } from "@/test/mocks/auth-client";
import { resetConvexMocks } from "@/test/mocks/convex-react";

afterEach(() => {
  resetConvexMocks();
  resetAuthClientMock();
});

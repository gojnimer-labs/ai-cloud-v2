import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import { QueryErrorBoundary } from "./query-error-boundary";

const Boom = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <div>ok</div>;
};

test("renders children when nothing throws", async () => {
  const screen = await render(
    <QueryErrorBoundary>
      <Boom shouldThrow={false} />
    </QueryErrorBoundary>
  );

  await expect.element(screen.getByText("ok")).toBeInTheDocument();
});

// The actual bug this guards against: a Convex query error (e.g. a
// transient error mid-deployment) thrown by a child during render used to
// propagate straight past the widget and unmount the entire authed shell
// mounted above it — see notification-bell.tsx/system-alert-banners.tsx's
// own doc comments for where this is wired in.
test("swallows a child render error instead of propagating it", async () => {
  const screen = await render(
    <QueryErrorBoundary>
      <Boom shouldThrow={true} />
    </QueryErrorBoundary>
  );

  await expect.element(screen.getByText("ok")).not.toBeInTheDocument();
});

import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { api } from "../../convex/_generated/api";
import { NewVersionBanner } from "./new-version-banner";

test("stays hidden while the deployment id is unchanged", async () => {
  mockQueryResult(api.staticHosting.getCurrentDeployment, {
    currentDeploymentId: "deploy-1",
  });
  const screen = await render(<NewVersionBanner />);
  await expect
    .element(screen.getByText("New version available"))
    .not.toBeInTheDocument();
});

test("appears once the deployment id changes", async () => {
  mockQueryResult(api.staticHosting.getCurrentDeployment, {
    currentDeploymentId: "deploy-1",
  });
  const screen = await render(<NewVersionBanner />);

  mockQueryResult(api.staticHosting.getCurrentDeployment, {
    currentDeploymentId: "deploy-2",
  });
  await screen.rerender(<NewVersionBanner />);

  await expect
    .element(screen.getByText("New version available"))
    .toBeInTheDocument();
});

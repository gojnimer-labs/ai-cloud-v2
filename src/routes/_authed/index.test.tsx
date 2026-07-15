import { expect, test } from "vitest";
import { m } from "@/paraglide/messages";
import { mockQueryResult } from "@/test/mocks/convex-react";
import { renderRoute } from "@/test/render";
import { api } from "../../../convex/_generated/api";

test("shows the signed-in user's email when available", async () => {
  mockQueryResult(api.auth.getCurrentUser, { email: "person@example.com" });
  const screen = await renderRoute({ path: "/" });

  await expect
    .element(
      screen.getByText(m.home_signed_in_as({ email: "person@example.com" }))
    )
    .toBeInTheDocument();
});

test("shows guest text when there is no user yet", async () => {
  const screen = await renderRoute({ path: "/" });

  await expect
    .element(screen.getByText(m.home_subtitle_guest()))
    .toBeInTheDocument();
});

test("renders the locale switcher", async () => {
  const screen = await renderRoute({ path: "/" });

  await expect
    .element(screen.getByRole("radiogroup", { name: "Language" }))
    .toBeInTheDocument();
});

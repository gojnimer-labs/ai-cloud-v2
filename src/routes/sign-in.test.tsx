import { expect, test } from "vitest";
import { m } from "@/paraglide/messages";
import { setMockSignInEmail } from "@/test/mocks/auth-client";
import { renderRoute } from "@/test/render";

test("submitting valid credentials navigates to the home screen", async () => {
  setMockSignInEmail(() => Promise.resolve({ error: null }));
  const { router, ...screen } = await renderRoute({
    auth: { isAuthenticated: false, isLoading: false },
    path: "/sign-in",
  });

  await screen.getByLabelText(m.label_email()).fill("person@example.com");
  await screen.getByLabelText(m.label_password()).fill("hunter2");

  // Mirrors main.tsx's real behavior: a successful sign-in flips
  // useConvexAuth() to authenticated, which InnerApp reflects into the
  // router's context so the _authed guard admits the post-login navigate.
  router.update({
    context: { auth: { isAuthenticated: true, isLoading: false } },
  });
  await screen.getByRole("button", { exact: true, name: m.login() }).click();

  await expect.poll(() => router.state.location.pathname).toBe("/");
});

test("submitting invalid credentials shows an error on the password field", async () => {
  setMockSignInEmail(() =>
    Promise.resolve({ error: { message: "bad credentials" } })
  );
  const screen = await renderRoute({
    auth: { isAuthenticated: false, isLoading: false },
    path: "/sign-in",
  });

  await screen.getByLabelText(m.label_email()).fill("person@example.com");
  await screen.getByLabelText(m.label_password()).fill("wrong-password");
  await screen.getByRole("button", { exact: true, name: m.login() }).click();

  await expect
    .element(screen.getByText(m.incorrect_password()))
    .toBeInTheDocument();
});

test("redirects away before rendering when already authenticated", async () => {
  const { router } = await renderRoute({
    auth: { isAuthenticated: true, isLoading: false },
    path: "/sign-in",
  });

  await expect.poll(() => router.state.location.pathname).toBe("/");
});

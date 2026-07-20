import { expect, test } from "vitest";

import { m } from "@/paraglide/messages";
import { setMockSignUpEmail } from "@/test/mocks/auth-client";
import { renderRoute } from "@/test/render";

test("submitting a new account navigates to the home screen", async () => {
  setMockSignUpEmail(() => Promise.resolve({ error: null }));
  const { router, ...screen } = await renderRoute({
    auth: { isAuthenticated: false, isLoading: false },
    path: "/sign-up",
  });

  await screen.getByLabelText(m.label_name()).fill("Person");
  await screen
    .getByLabelText(m.label_password(), { exact: true })
    .fill("hunter2");
  await screen.getByLabelText(m.label_confirm_password()).fill("hunter2");

  router.update({
    context: { auth: { isAuthenticated: true, isLoading: false } },
  });
  await screen.getByRole("button", { exact: true, name: m.sign_up() }).click();

  await expect.poll(() => router.state.location.pathname).toBe("/");
});

test("mismatched confirm-password blocks submission", async () => {
  setMockSignUpEmail(() => Promise.resolve({ error: null }));
  const screen = await renderRoute({
    auth: { isAuthenticated: false, isLoading: false },
    path: "/sign-up",
  });

  await screen.getByLabelText(m.label_name()).fill("Person");
  await screen
    .getByLabelText(m.label_password(), { exact: true })
    .fill("hunter2");
  await screen.getByLabelText(m.label_confirm_password()).fill("hunter3");

  await expect
    .element(screen.getByText(m.confirm_password_mismatch()))
    .toBeInTheDocument();
});

test("a signup failure shows an error on the password field", async () => {
  setMockSignUpEmail(() =>
    Promise.resolve({ error: { message: "email already in use" } })
  );
  const screen = await renderRoute({
    auth: { isAuthenticated: false, isLoading: false },
    path: "/sign-up",
  });

  await screen.getByLabelText(m.label_name()).fill("Person");
  await screen
    .getByLabelText(m.label_password(), { exact: true })
    .fill("hunter2");
  await screen.getByLabelText(m.label_confirm_password()).fill("hunter2");
  await screen.getByRole("button", { exact: true, name: m.sign_up() }).click();

  await expect
    .element(screen.getByText("email already in use"))
    .toBeInTheDocument();
});

test("redirects away before rendering when already authenticated", async () => {
  const { router } = await renderRoute({
    auth: { isAuthenticated: true, isLoading: false },
    path: "/sign-up",
  });

  await expect.poll(() => router.state.location.pathname).toBe("/");
});

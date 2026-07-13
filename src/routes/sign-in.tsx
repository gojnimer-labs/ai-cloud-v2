// Copyright (c) Meta Platforms, Inc. and affiliates.

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { CubeIcon } from "@heroicons/react/24/outline";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { useAppForm } from "@/lib/form/form";
import { requiredEmail, requiredText } from "@/lib/form/schemas";
import { m } from "@/paraglide/messages";

const fallback = "/" as const;

export const Route = createFileRoute("/sign-in")({
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect || fallback });
    }
  },
  component: LoginSimple,
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
});

// Brand sign-in marks — no heroicons or template-assets equivalent.
const AppleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={16}
    viewBox="0 0 24 24"
    width={16}
    {...props}
  >
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={16}
    viewBox="0 0 24 24"
    width={16}
    {...props}
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

// Standalone auth page paints its own body background (no host shell).
const pageStyle: CSSProperties = {
  backgroundColor: "var(--color-background-body)",
  minHeight: "100%",
  padding: "var(--spacing-6)",
};
// Cap the column at 400px but let it shrink to fit narrow screens (Stack
// has no maxWidth prop, so it's set here).
const contentStyle: CSSProperties = {
  maxWidth: 400,
  width: "100%",
};

function LoginSimple() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: {
      // Treated as a validator (not a plain onSubmit) so an invalid-credentials
      // response from the server can attach an error to a specific field.
      onSubmitAsync: async ({ value }) => {
        const { error } = await authClient.signIn.email(value);
        if (error) {
          return { fields: { password: m.incorrect_password() } };
        }
        await navigate({ to: search.redirect || fallback });
        return null;
      },
    },
  });

  return (
    <Center axis="both" style={pageStyle}>
      <VStack gap={4} hAlign="center" style={contentStyle}>
        {/* Logo */}
        <VStack gap={2} hAlign="center">
          <Icon icon={CubeIcon} size="lg" />
          <Text size="lg" type="body" weight="bold">
            {m.product_name()}
          </Text>
        </VStack>

        {/* Card */}
        <Card padding={8} width="100%">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <form.AppForm>
              <VStack gap={4} hAlign="stretch">
                {/* Header */}
                <VStack gap={1} hAlign="center">
                  <Heading level={2}>{m.welcome_back()}</Heading>
                  <Text color="secondary" size="sm" type="body">
                    {m.sign_in_subtitle()}
                  </Text>
                </VStack>

                {/* Form fields */}
                <VStack gap={2}>
                  <form.AppField
                    name="email"
                    validators={{ onChange: requiredEmail }}
                  >
                    {(field) => (
                      <field.TextField
                        label={m.label_email()}
                        placeholder={m.placeholder_email()}
                        size="lg"
                        type="email"
                      />
                    )}
                  </form.AppField>
                  <VStack gap={1}>
                    <form.AppField
                      name="password"
                      validators={{ onChange: requiredText }}
                    >
                      {(field) => (
                        <field.TextField
                          label={m.label_password()}
                          placeholder={m.placeholder_password()}
                          size="lg"
                          type="password"
                        />
                      )}
                    </form.AppField>
                    <VStack hAlign="end">
                      <Link
                        color="secondary"
                        href="#"
                        size="sm"
                        type="supporting"
                      >
                        {m.forgot_password()}
                      </Link>
                    </VStack>
                  </VStack>
                </VStack>

                {/* Login button */}
                <form.SubmitButton
                  label={m.login()}
                  size="lg"
                  variant="primary"
                />

                {/* Divider */}
                <Divider label={m.continue_with()} />

                {/* Social buttons */}
                <VStack gap={3} hAlign="stretch">
                  <Button
                    icon={<AppleIcon />}
                    label={m.login_with_apple()}
                    size="lg"
                    variant="secondary"
                  />
                  <Button
                    icon={<GoogleIcon />}
                    label={m.login_with_google()}
                    size="lg"
                    variant="secondary"
                  />
                </VStack>

                {/* Sign up link */}
                <VStack hAlign="center">
                  <Text color="secondary" type="supporting">
                    {m.no_account_prompt()}{" "}
                    <Link href="/sign-up" type="supporting">
                      {m.sign_up()}
                    </Link>
                  </Text>
                </VStack>
              </VStack>
            </form.AppForm>
          </form>
        </Card>

        {/* Terms */}
        <VStack hAlign="center" width="100%">
          <Text color="secondary" justify="center" type="supporting">
            {m.terms_prefix()}{" "}
            <Link href="#" type="supporting">
              {m.terms_of_service()}
            </Link>{" "}
            {m.terms_and()}{" "}
            <Link href="#" type="supporting">
              {m.privacy_policy()}
            </Link>
            .
          </Text>
        </VStack>
      </VStack>
    </Center>
  );
}

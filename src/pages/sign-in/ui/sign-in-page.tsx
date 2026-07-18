// Copyright (c) Meta Platforms, Inc. and affiliates.

import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { m } from "@/paraglide/messages";
import { authClient } from "@/shared/api/auth-client";
import { useAppForm } from "@/shared/lib/form/form";
import { requiredEmail, requiredText } from "@/shared/lib/form/schemas";
import { AuthBranding } from "@/shared/ui/auth-branding";
import { AuthPageShell } from "@/shared/ui/auth-page-shell";

const fallback = "/" as const;

export const SignInPage = () => {
  const search = useSearch({ from: "/sign-in" });
  const navigate = useNavigate();

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: {
      // Treated as a validator (not a plain onSubmit) so an invalid-credentials
      // response from the server can attach an error to a specific field.
      onSubmitAsync: async ({ value }) => {
        const { error } = await authClient.signIn.email(value);
        if (error) {
          return {
            fields: { password: error.message ?? m.incorrect_password() },
          };
        }
        await navigate({ to: search.redirect || fallback });
        return null;
      },
    },
  });

  return (
    <AuthPageShell>
      <AuthBranding />

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
    </AuthPageShell>
  );
};

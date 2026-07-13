// Mirrors the login-card template's visual language (same Card/VStack scaffold,
// no dedicated astryx sign-up template exists) for a create-account flow.

import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
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
import { required } from "@/lib/form/validators";
import { m } from "@/paraglide/messages";

const fallback = "/" as const;

export const Route = createFileRoute("/sign-up")({
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect || fallback });
    }
  },
  component: SignUpPage,
  validateSearch: z.object({
    redirect: z.string().optional().catch(""),
  }),
});

const pageStyle: CSSProperties = {
  backgroundColor: "var(--color-background-body)",
  minHeight: "100%",
  padding: "var(--spacing-6)",
};
const contentStyle: CSSProperties = {
  maxWidth: 400,
  width: "100%",
};

function SignUpPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const form = useAppForm({
    defaultValues: { email: "", name: "", password: "" },
    validators: {
      // Treated as a validator (not a plain onSubmit) so a signup failure
      // from the server can attach an error to a specific field.
      onSubmitAsync: async ({ value }) => {
        const { error } = await authClient.signUp.email({
          email: value.email,
          name: value.name || value.email,
          password: value.password,
        });
        if (error) {
          return {
            fields: { password: error.message ?? m.sign_up_error_generic() },
          };
        }
        await navigate({ to: search.redirect || fallback });
        return null;
      },
    },
  });

  return (
    <Center axis="both" style={pageStyle}>
      <VStack gap={4} hAlign="center" style={contentStyle}>
        <VStack gap={2} hAlign="center">
          <Icon icon={CubeIcon} size="lg" />
          <Text size="lg" type="body" weight="bold">
            {m.product_name()}
          </Text>
        </VStack>

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
                <VStack gap={1} hAlign="center">
                  <Heading level={2}>{m.create_account_heading()}</Heading>
                  <Text color="secondary" size="sm" type="body">
                    {m.create_account_subtitle()}
                  </Text>
                </VStack>

                <VStack gap={2}>
                  <form.AppField name="name">
                    {(field) => (
                      <field.TextField
                        label={m.label_name()}
                        placeholder={m.placeholder_name()}
                        size="lg"
                      />
                    )}
                  </form.AppField>
                  <form.AppField
                    name="email"
                    validators={{ onChange: required }}
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
                  <form.AppField
                    name="password"
                    validators={{ onChange: required }}
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
                </VStack>

                <form.SubmitButton
                  label={m.sign_up()}
                  size="lg"
                  variant="primary"
                />

                <VStack hAlign="center">
                  <Text color="secondary" type="supporting">
                    {m.has_account_prompt()}{" "}
                    <Link href="/sign-in" type="supporting">
                      {m.sign_in()}
                    </Link>
                  </Text>
                </VStack>
              </VStack>
            </form.AppForm>
          </form>
        </Card>
      </VStack>
    </Center>
  );
}

// Mirrors the login-card template's visual language (same Card/VStack scaffold,
// no dedicated astryx sign-up template exists) for a create-account flow.

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

export const SignUpPage = () => {
  const search = useSearch({ from: "/sign-up" });
  const navigate = useNavigate();
  // Only ever populated by invite-activate-page.tsx's post-activation
  // redirect, which already resolved this email server-side from the
  // invite's token. requireInvite (convex/auth.ts) hard-rejects
  // /sign-up/email if the submitted email doesn't match that invite's email,
  // so an editable field here can only "succeed" by being left untouched —
  // lock it instead of inviting an edit that's guaranteed to fail.
  const emailKnownFromInvite = Boolean(search.email);

  const form = useAppForm({
    defaultValues: { email: search.email || "", name: "", password: "" },
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
    <AuthPageShell>
      <AuthBranding />

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
                  validators={{ onChange: requiredEmail }}
                >
                  {(field) => (
                    <field.TextField
                      disabledMessage={
                        emailKnownFromInvite
                          ? m.sign_up_email_locked_message()
                          : undefined
                      }
                      isDisabled={emailKnownFromInvite}
                      label={m.label_email()}
                      placeholder={m.placeholder_email()}
                      size="lg"
                      type="email"
                    />
                  )}
                </form.AppField>
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
    </AuthPageShell>
  );
};

import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";

import {
  audienceLabel,
  NOTIFICATION_VARIANTS,
  SYSTEM_ALERT_AUDIENCES,
  variantLabel,
} from "@/entities/notifications";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { EMPTY_ALERT_FORM_STATE } from "../model/types";
import type { AlertFormState } from "../model/types";

const ComposeContent = ({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) => {
  const [state, setState] = useState<AlertFormState>(EMPTY_ALERT_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Minted once per dialog open (this component remounts fresh every time,
  // since the parent only renders it while the dialog is open) and forwarded
  // as the send's idempotency key — see convex/systemAlerts/mutations.ts's
  // doc comment on why a retried/double-submitted post must reuse it rather
  // than a fresh one. useRef (not useState) since it's never updated after
  // mount, just read.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const createSystemAlert = useMutation(
    api.systemAlerts.mutations.createSystemAlert
  );

  const canSubmit = state.title.trim().length > 0;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await createSystemAlert({
        audience: state.audience,
        body: state.body.trim() || undefined,
        href: state.href.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current,
        isDismissable: state.isDismissable,
        title: state.title.trim(),
        variant: state.variant,
      });
      onSubmitted();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout
      content={
        <LayoutContent>
          <VStack gap={4}>
            <Selector
              label={m.admin_notifications_variant_label()}
              onChange={(variant) =>
                setState({
                  ...state,
                  variant: variant as AlertFormState["variant"],
                })
              }
              options={NOTIFICATION_VARIANTS.map((variant) => ({
                label: variantLabel(variant),
                value: variant,
              }))}
              value={state.variant}
            />
            <TextInput
              label={m.admin_notifications_title_label()}
              onChange={(title) => setState({ ...state, title })}
              value={state.title}
            />
            <TextArea
              isOptional
              label={m.admin_notifications_body_label()}
              onChange={(body) => setState({ ...state, body })}
              rows={4}
              value={state.body}
            />
            <TextInput
              isOptional
              label={m.admin_notifications_href_label()}
              onChange={(href) => setState({ ...state, href })}
              value={state.href}
            />
            <Selector
              label={m.admin_notifications_audience_label()}
              onChange={(audience) =>
                setState({
                  ...state,
                  audience: audience as AlertFormState["audience"],
                })
              }
              options={SYSTEM_ALERT_AUDIENCES.map((audience) => ({
                label: audienceLabel(audience),
                value: audience,
              }))}
              value={state.audience}
            />
            <CheckboxInput
              description={m.admin_notifications_dismissable_description()}
              label={m.admin_notifications_dismissable_label()}
              onChange={(isDismissable) =>
                setState({ ...state, isDismissable })
              }
              value={state.isDismissable}
            />
            {error ? (
              <Text weight="medium">
                {m.admin_notifications_error({ error })}
              </Text>
            ) : null}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} hAlign="end">
            <Button label={m.cancel()} onClick={onClose} variant="secondary" />
            <Button
              isDisabled={isSubmitting || !canSubmit}
              label={
                isSubmitting
                  ? m.admin_notifications_sending()
                  : m.admin_notifications_send()
              }
              onClick={handleSubmit}
              variant="primary"
            />
          </HStack>
        </LayoutFooter>
      }
      header={
        <DialogHeader
          onOpenChange={onClose}
          title={m.admin_notifications_alert_compose_title()}
        />
      }
    />
  );
};

export const SystemAlertComposeDialog = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => (
  <Dialog
    isOpen={isOpen}
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="form"
    width={480}
  >
    {isOpen ? <ComposeContent onClose={onClose} onSubmitted={onClose} /> : null}
  </Dialog>
);

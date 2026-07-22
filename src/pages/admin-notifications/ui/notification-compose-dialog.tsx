import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { api } from "@convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";

import { NOTIFICATION_VARIANTS, variantLabel } from "@/entities/notifications";
import { UserSelect } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import {
  EMPTY_NOTIFICATION_FORM_STATE,
  EVERYONE_TARGET_VALUE,
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
} from "../model/types";
import type { NotificationFormState } from "../model/types";

// Target is a name (a specific user, or the synthetic "Everyone" entry) OR
// one or more groups — mutually exclusive, so picking a group disables the
// name field rather than switching between modes with a segmented control.
const ComposeContent = ({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) => {
  const [state, setState] = useState<NotificationFormState>(
    EMPTY_NOTIFICATION_FORM_STATE
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Minted once per dialog open (this component remounts fresh every time,
  // since the parent only renders it while the dialog is open) and forwarded
  // as the send's idempotency key — see convex/notifications/mutations.ts's
  // doc comment on why a retried/double-submitted send must reuse it rather
  // than a fresh one. useRef (not useState) since it's never updated after
  // mount, just read.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const groups = useQuery(api.groups.queries.listGroups);
  const sendToUser = useMutation(api.notifications.mutations.sendToUser);
  const broadcastToGroups = useMutation(
    api.notifications.mutations.broadcastToGroups
  );
  const broadcastToEveryone = useAction(
    api.notifications.actions.broadcastToEveryone
  );

  const hasGroups = state.groupIds.length > 0;
  const canSubmit =
    state.title.trim().length > 0 && (hasGroups || state.userId.length > 0);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const shared = {
        body: state.body.trim() || undefined,
        href: state.href.trim() || undefined,
        title: state.title.trim(),
        variant: state.variant,
      };
      if (hasGroups) {
        await broadcastToGroups({
          ...shared,
          groupIds: state.groupIds,
          idempotencyKey: idempotencyKeyRef.current,
        });
      } else if (state.userId === EVERYONE_TARGET_VALUE) {
        await broadcastToEveryone({
          ...shared,
          idempotencyKey: idempotencyKeyRef.current,
        });
      } else {
        await sendToUser({
          ...shared,
          idempotencyKey: idempotencyKeyRef.current,
          userId: state.userId,
        });
      }
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
            <UserSelect
              disabledMessage={
                hasGroups
                  ? m.admin_notifications_user_disabled_description()
                  : undefined
              }
              extraOptions={[
                {
                  label: m.admin_notifications_target_everyone(),
                  value: EVERYONE_TARGET_VALUE,
                },
              ]}
              isDisabled={hasGroups}
              label={m.admin_notifications_user_label()}
              onChange={(userId) => setState({ ...state, userId })}
              value={state.userId}
            />
            <Divider label={m.admin_notifications_target_or()} />
            <MultiSelector
              label={m.admin_notifications_groups_label()}
              onChange={(groupIds) =>
                setState({
                  ...state,
                  groupIds: groupIds as NotificationFormState["groupIds"],
                })
              }
              options={(groups ?? []).map((group) => ({
                label: group.name,
                value: group._id,
              }))}
              value={state.groupIds}
            />

            <Selector
              label={m.admin_notifications_variant_label()}
              onChange={(variant) =>
                setState({
                  ...state,
                  variant: variant as NotificationFormState["variant"],
                })
              }
              options={NOTIFICATION_VARIANTS.map((variant) => ({
                label: variantLabel(variant),
                value: variant,
              }))}
              value={state.variant}
            />
            <TextInput
              description={`${state.title.length}/${MAX_TITLE_LENGTH}`}
              label={m.admin_notifications_title_label()}
              onChange={(title) =>
                setState({ ...state, title: title.slice(0, MAX_TITLE_LENGTH) })
              }
              value={state.title}
            />
            <TextArea
              isOptional
              label={m.admin_notifications_body_label()}
              maxLength={MAX_BODY_LENGTH}
              onChange={(body) =>
                setState({ ...state, body: body.slice(0, MAX_BODY_LENGTH) })
              }
              rows={4}
              value={state.body}
            />
            <TextInput
              isOptional
              label={m.admin_notifications_href_label()}
              onChange={(href) => setState({ ...state, href })}
              value={state.href}
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
          title={m.admin_notifications_compose_title()}
        />
      }
    />
  );
};

export const NotificationComposeDialog = ({
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

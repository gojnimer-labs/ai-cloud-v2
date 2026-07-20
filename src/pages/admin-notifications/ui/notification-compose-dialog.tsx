import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { api } from "@convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";

import {
  audienceLabel,
  NOTIFICATION_VARIANTS,
  SYSTEM_ALERT_AUDIENCES,
  variantLabel,
} from "@/entities/notifications";
import { UserSelect } from "@/entities/session";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { EMPTY_COMPOSE_FORM_STATE } from "../model/types";
import type { ComposeFormState, TargetMode } from "../model/types";

const targetModeLabel = (mode: TargetMode) => {
  if (mode === "user") {
    return m.admin_notifications_target_user();
  }
  if (mode === "groups") {
    return m.admin_notifications_target_groups();
  }
  if (mode === "everyone") {
    return m.admin_notifications_target_everyone();
  }
  return m.admin_notifications_target_alert();
};

const ComposeContent = ({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) => {
  const [state, setState] = useState<ComposeFormState>(
    EMPTY_COMPOSE_FORM_STATE
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
  const createSystemAlert = useMutation(
    api.systemAlerts.mutations.createSystemAlert
  );

  const canSubmit =
    state.title.trim().length > 0 &&
    (state.targetMode !== "user" || state.userId.length > 0) &&
    (state.targetMode !== "groups" || state.groupIds.length > 0);

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
      if (state.targetMode === "user") {
        await sendToUser({
          ...shared,
          idempotencyKey: idempotencyKeyRef.current,
          userId: state.userId,
        });
      } else if (state.targetMode === "groups") {
        await broadcastToGroups({
          ...shared,
          groupIds: state.groupIds,
          idempotencyKey: idempotencyKeyRef.current,
        });
      } else if (state.targetMode === "everyone") {
        await broadcastToEveryone({
          ...shared,
          idempotencyKey: idempotencyKeyRef.current,
        });
      } else {
        await createSystemAlert({
          ...shared,
          audience: state.audience,
          idempotencyKey: idempotencyKeyRef.current,
          isDismissable: state.isDismissable,
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
            <SegmentedControl
              label={m.admin_notifications_target_label()}
              layout="fill"
              onChange={(value) =>
                setState({ ...state, targetMode: value as TargetMode })
              }
              value={state.targetMode}
            >
              {(
                ["user", "groups", "everyone", "alert"] satisfies TargetMode[]
              ).map((mode) => (
                <SegmentedControlItem
                  key={mode}
                  label={targetModeLabel(mode)}
                  value={mode}
                />
              ))}
            </SegmentedControl>

            {state.targetMode === "user" ? (
              <UserSelect
                label={m.admin_notifications_user_label()}
                onChange={(userId) => setState({ ...state, userId })}
                value={state.userId}
              />
            ) : null}
            {state.targetMode === "groups" ? (
              <MultiSelector
                label={m.admin_notifications_groups_label()}
                onChange={(groupIds) =>
                  setState({
                    ...state,
                    groupIds: groupIds as ComposeFormState["groupIds"],
                  })
                }
                options={(groups ?? []).map((group) => ({
                  label: group.name,
                  value: group._id,
                }))}
                value={state.groupIds}
              />
            ) : null}

            <Selector
              label={m.admin_notifications_variant_label()}
              onChange={(variant) =>
                setState({
                  ...state,
                  variant: variant as ComposeFormState["variant"],
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
            {state.targetMode === "alert" ? (
              <Selector
                label={m.admin_notifications_audience_label()}
                onChange={(audience) =>
                  setState({
                    ...state,
                    audience: audience as ComposeFormState["audience"],
                  })
                }
                options={SYSTEM_ALERT_AUDIENCES.map((audience) => ({
                  label: audienceLabel(audience),
                  value: audience,
                }))}
                value={state.audience}
              />
            ) : null}
            {state.targetMode === "alert" ? (
              <CheckboxInput
                description={m.admin_notifications_dismissable_description()}
                label={m.admin_notifications_dismissable_label()}
                onChange={(isDismissable) =>
                  setState({ ...state, isDismissable })
                }
                value={state.isDismissable}
              />
            ) : null}
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

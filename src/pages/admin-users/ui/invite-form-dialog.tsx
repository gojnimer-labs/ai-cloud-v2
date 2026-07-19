import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";
import { requiredEmail } from "@/shared/lib/form/schemas";

import type { InviteRole } from "../model/types";

export const InviteFormDialog = ({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (link: string) => void;
}) => {
  const createInvite = useMutation(api.admin.mutations.createInvite);
  const groups = useQuery(api.groups.queries.listGroups);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("user");
  const [groupIds, setGroupIds] = useState<Id<"groups">[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEmailValid = requiredEmail.safeParse(email).success;

  const groupOptions = useMemo(
    () =>
      (groups ?? []).map((group) => ({ label: group.name, value: group._id })),
    [groups]
  );

  const roleOptions = useMemo(
    () => [
      {
        description: m.admin_users_invite_dialog_role_user_description(),
        label: m.admin_users_invite_dialog_role_user(),
        value: "user",
      },
      {
        description: m.admin_users_invite_dialog_role_admin_description(),
        label: m.admin_users_invite_dialog_role_admin(),
        value: "admin",
      },
    ],
    []
  );

  const handleClose = () => {
    setEmail("");
    setRole("user");
    setGroupIds([]);
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const { token } = await createInvite({
        email,
        groupIds: groupIds.length > 0 ? groupIds : undefined,
        role,
      });
      onCreated(new URL(`/invite/${token}`, window.location.origin).toString());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : m.admin_users_invite_error_generic()
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
      purpose="form"
      width={420}
    >
      <Layout
        content={
          <LayoutContent>
            <VStack gap={3}>
              <TextInput
                label={m.admin_users_invite_dialog_email_label()}
                onChange={setEmail}
                placeholder={m.placeholder_email()}
                type="email"
                value={email}
              />
              <Selector
                label={m.admin_users_invite_dialog_role_label()}
                onChange={(value) => setRole(value as InviteRole)}
                options={roleOptions}
                renderOption={(option) => {
                  // SelectorOptionData (the renderOption param type) only
                  // declares value/label/disabled/icon, not the extra
                  // `description` this app's own roleOptions carry — this
                  // cast is safe since `options={roleOptions}` above is what
                  // renderOption is called with at runtime.
                  const roleOption = option as (typeof roleOptions)[number];
                  return (
                    <SelectorOption
                      description={roleOption.description}
                      label={roleOption.label}
                    />
                  );
                }}
                value={role}
              />
              <MultiSelector
                description={m.admin_users_invite_dialog_groups_description()}
                hasSearch
                label={m.admin_users_invite_dialog_groups_label()}
                onChange={(value) => setGroupIds(value as Id<"groups">[])}
                options={groupOptions}
                placeholder={m.admin_users_invite_dialog_groups_placeholder()}
                triggerDisplay="badges"
                value={groupIds}
              />
              {error ? <Text weight="medium">{error}</Text> : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <Toolbar
              endContent={
                <>
                  <Button
                    label={m.cancel()}
                    onClick={handleClose}
                    variant="secondary"
                  />
                  <Button
                    isDisabled={isSubmitting || !isEmailValid}
                    label={
                      isSubmitting
                        ? m.saving()
                        : m.admin_users_invite_dialog_submit()
                    }
                    onClick={handleSubmit}
                    variant="primary"
                  />
                </>
              }
              label={m.admin_users_invite_dialog_actions()}
            />
          </LayoutFooter>
        }
        header={<DialogHeader title={m.admin_users_invite_dialog_heading()} />}
      />
    </Dialog>
  );
};

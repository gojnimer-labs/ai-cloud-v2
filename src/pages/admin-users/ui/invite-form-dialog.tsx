import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Text } from "@astryxdesign/core/Text";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { useState } from "react";

import { m } from "@/paraglide/messages";
import { inviteAuthClient } from "@/shared/api/invite-client";

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
  const [role, setRole] = useState<InviteRole>("user");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setRole("user");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    const { data, error: createError } = await inviteAuthClient.invite.create({
      role,
    });
    setIsSubmitting(false);
    if (createError || !data) {
      setError(createError?.message ?? m.admin_users_invite_error_generic());
      return;
    }
    onCreated(data.message);
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
            <RadioList
              label={m.admin_users_invite_dialog_role_label()}
              onChange={(value) => setRole(value as InviteRole)}
              value={role}
            >
              <RadioListItem
                label={m.admin_users_invite_dialog_role_user()}
                value="user"
              />
              <RadioListItem
                label={m.admin_users_invite_dialog_role_admin()}
                value="admin"
              />
            </RadioList>
            {error ? <Text weight="medium">{error}</Text> : null}
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
                    isDisabled={isSubmitting}
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

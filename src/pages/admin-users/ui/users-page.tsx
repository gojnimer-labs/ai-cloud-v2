import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Section } from "@astryxdesign/core/Section";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";

import { m } from "@/paraglide/messages";

import type { AdminUserRow, InviteRow } from "../model/types";
import { useAdminUsers } from "../model/use-admin-users";
import { InviteDetailPanel } from "./invite-detail-panel";
import { InviteFormDialog } from "./invite-form-dialog";
import { InviteLinkDialog } from "./invite-link-dialog";
import { InvitesTable } from "./invites-table";
import { UserDetailPanel } from "./user-detail-panel";
import { UsersTable } from "./users-table";

type AdminUsersTab = "users" | "invites";

type DetailSelection =
  | { kind: "user"; user: AdminUserRow }
  | { kind: "invite"; invite: InviteRow }
  | null;

export const UsersPage = () => {
  const [activeTab, setActiveTab] = useState<AdminUsersTab>("users");
  const [detailSelection, setDetailSelection] = useState<DetailSelection>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const { banAlertElement, confirmBan, error, toggleAdmin, unban, users } =
    useAdminUsers();
  const cancelInvite = useMutation(api.admin.mutations.cancelInvite);

  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Card height="100%" padding={0}>
        <Layout
          content={
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
            <LayoutContent padding={3} role="main">
              {activeTab === "users" ? (
                <UsersTable
                  error={error}
                  onSelectUser={(user) =>
                    setDetailSelection({ kind: "user", user })
                  }
                  users={users}
                />
              ) : (
                <InvitesTable
                  onSelectInvite={(invite) =>
                    setDetailSelection({ invite, kind: "invite" })
                  }
                />
              )}
            </LayoutContent>
          }
          end={
            detailSelection && (
              <>
                <ResizeHandle
                  isAlwaysVisible={false}
                  isReversed
                  resizable={detailPanel.props}
                />
                {detailSelection.kind === "user" ? (
                  <UserDetailPanel
                    onBan={confirmBan}
                    onClose={() => setDetailSelection(null)}
                    onToggleAdmin={toggleAdmin}
                    onUnban={unban}
                    resizable={detailPanel.props}
                    user={detailSelection.user}
                  />
                ) : (
                  <InviteDetailPanel
                    invite={detailSelection.invite}
                    onCancel={(invite) => cancelInvite({ token: invite.token })}
                    onClose={() => setDetailSelection(null)}
                    resizable={detailPanel.props}
                  />
                )}
              </>
            )
          }
          header={
            <LayoutHeader hasDivider padding={0}>
              <Toolbar
                endContent={
                  activeTab === "invites" ? (
                    <Button
                      label={m.admin_users_invite_button()}
                      onClick={() => setIsCreateOpen(true)}
                      variant="primary"
                    />
                  ) : null
                }
                label={m.nav_users()}
                startContent={
                  <TabList
                    onChange={(value) => {
                      setActiveTab(value as AdminUsersTab);
                      setDetailSelection(null);
                    }}
                    value={activeTab}
                  >
                    <Tab label={m.admin_users_tab_users()} value="users" />
                    <Tab label={m.admin_users_tab_invites()} value="invites" />
                  </TabList>
                }
              />
            </LayoutHeader>
          }
          height="fill"
        />
      </Card>

      <InviteFormDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(link) => {
          setIsCreateOpen(false);
          setCreatedLink(link);
        }}
      />
      <InviteLinkDialog
        link={createdLink}
        onClose={() => setCreatedLink(null)}
      />
      {banAlertElement}
    </Section>
  );
};

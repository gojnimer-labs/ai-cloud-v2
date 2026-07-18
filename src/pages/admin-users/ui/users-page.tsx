import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { useState } from "react";

import { m } from "@/paraglide/messages";

import { InviteFormDialog } from "./invite-form-dialog";
import { InviteLinkDialog } from "./invite-link-dialog";
import { InvitesTable } from "./invites-table";
import { UsersTable } from "./users-table";

type AdminUsersTab = "users" | "invites";

export const UsersPage = () => {
  const [activeTab, setActiveTab] = useState<AdminUsersTab>("users");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Card height="100%" padding={0}>
        <Layout
          content={
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
            <LayoutContent padding={0} role="main">
              {activeTab === "users" ? <UsersTable /> : <InvitesTable />}
            </LayoutContent>
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
                    onChange={(value) => setActiveTab(value as AdminUsersTab)}
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
    </Section>
  );
};

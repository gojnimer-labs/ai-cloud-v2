import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { useState } from "react";

import { m } from "@/paraglide/messages";

import { InvitesTable } from "./invites-table";
import { UsersTable } from "./users-table";

type AdminUsersTab = "users" | "invites";

export const UsersPage = () => {
  const [activeTab, setActiveTab] = useState<AdminUsersTab>("users");

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
            <LayoutHeader hasDivider padding={4}>
              <VStack gap={3}>
                <HStack gap={3} vAlign="center">
                  <StackItem size="fill">
                    <Heading level={1}>{m.nav_users()}</Heading>
                  </StackItem>
                </HStack>
                <TabList
                  onChange={(value) => setActiveTab(value as AdminUsersTab)}
                  value={activeTab}
                >
                  <Tab label={m.admin_users_tab_users()} value="users" />
                  <Tab label={m.admin_users_tab_invites()} value="invites" />
                </TabList>
              </VStack>
            </LayoutHeader>
          }
          height="fill"
        />
      </Card>
    </Section>
  );
};

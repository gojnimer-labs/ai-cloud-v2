import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Section } from "@astryxdesign/core/Section";
import { useState } from "react";

import { m } from "@/paraglide/messages";

import type { AdminUserRow } from "../model/types";
import { useAdminUsers } from "../model/use-admin-users";
import { UserDetailPanel } from "./user-detail-panel";
import { UsersTable } from "./users-table";

export const UsersPage = () => {
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);

  const { banAlertElement, confirmBan, error, toggleAdmin, unban, users } =
    useAdminUsers();

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
              <UsersTable
                error={error}
                onSelectUser={setSelectedUser}
                users={users}
              />
            </LayoutContent>
          }
          end={
            selectedUser && (
              <>
                <ResizeHandle
                  isAlwaysVisible={false}
                  isReversed
                  resizable={detailPanel.props}
                />
                <UserDetailPanel
                  onBan={confirmBan}
                  onClose={() => setSelectedUser(null)}
                  onToggleAdmin={toggleAdmin}
                  onUnban={unban}
                  resizable={detailPanel.props}
                  user={selectedUser}
                />
              </>
            )
          }
          header={
            <LayoutHeader hasDivider padding={4}>
              <Heading level={1}>{m.nav_users()}</Heading>
            </LayoutHeader>
          }
          height="fill"
        />
      </Card>

      {banAlertElement}
    </Section>
  );
};

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Section } from "@astryxdesign/core/Section";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";

import { m } from "@/paraglide/messages";

import type { InviteRow } from "../model/types";
import { InviteDetailPanel } from "./invite-detail-panel";
import { InviteFormDialog } from "./invite-form-dialog";
import { InviteLinkDialog } from "./invite-link-dialog";
import { InvitesTable } from "./invites-table";

export const InvitesPage = () => {
  const cancelInvite = useMutation(api.admin.mutations.cancelInvite);
  const [selectedInvite, setSelectedInvite] = useState<InviteRow | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

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
              <InvitesTable onSelectInvite={setSelectedInvite} />
            </LayoutContent>
          }
          end={
            selectedInvite && (
              <>
                <ResizeHandle
                  isAlwaysVisible={false}
                  isReversed
                  resizable={detailPanel.props}
                />
                <InviteDetailPanel
                  invite={selectedInvite}
                  onCancel={(invite) => cancelInvite({ token: invite.token })}
                  onClose={() => setSelectedInvite(null)}
                  resizable={detailPanel.props}
                />
              </>
            )
          }
          header={
            <LayoutHeader hasDivider padding={0}>
              <Toolbar
                endContent={
                  <Button
                    label={m.admin_invites_create_button()}
                    onClick={() => setIsCreateOpen(true)}
                    variant="primary"
                  />
                }
                label={m.nav_invites()}
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

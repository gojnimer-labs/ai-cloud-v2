import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { api } from "@convex/_generated/api";
import { getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { m } from "@/paraglide/messages";

import { INVITE_STATUS_OPTIONS, USER_ROLE_OPTIONS } from "../model/format";
import type { InviteRow } from "../model/types";
import { InviteDetailPanel } from "./invite-detail-panel";
import { InviteFormDialog } from "./invite-form-dialog";
import { InviteLinkDialog } from "./invite-link-dialog";
import { InvitesTable } from "./invites-table";

const routeApi = getRouteApi("/_authed/admin/invites");

const INVITE_FIELD_DEFS = [
  { key: "email", label: m.admin_invites_column_email(), type: "string" },
  {
    enumValues: USER_ROLE_OPTIONS,
    key: "role",
    label: m.admin_users_column_role(),
    type: "enum",
  },
  {
    enumValues: INVITE_STATUS_OPTIONS,
    key: "status",
    label: m.admin_invites_column_status(),
    type: "enum",
  },
  {
    key: "createdByEmail",
    label: m.admin_invites_column_created_by(),
    type: "string",
  },
] as const;

// Canceled and used invites are hidden by default so the page opens on
// invites an admin might still act on — clearing this filter surfaces the
// full history, same as admin-users hides banned accounts by default.
const DEFAULT_FILTERS: PowerSearchFilter[] = [
  {
    field: "status",
    operator: "is_none_of",
    value: { type: "enum_list", value: ["canceled", "used"] },
  },
];

export const InvitesPage = () => {
  const invites = useQuery(api.invites.queries.listInvites);
  const cancelInvite = useMutation(api.invites.mutations.cancelInvite);
  const [filters, setFilters] = useState<PowerSearchFilter[]>(DEFAULT_FILTERS);
  const { applyFilters, config } = usePowerSearchConfig(
    INVITE_FIELD_DEFS,
    "AdminInvitesSearch"
  );

  const { modal } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const isCreateOpen = modal === "create";

  const closeCreateDialog = () => {
    navigate({
      replace: true,
      search: (prev) => {
        const { modal: _modal, ...rest } = prev;
        return rest;
      },
    });
  };

  const [selectedInvite, setSelectedInvite] = useState<InviteRow | null>(null);
  // Intentionally NOT URL-driven, unlike the create dialog above — this
  // carries the invite's one-time activation link (a secret token), which
  // shouldn't end up sitting in the URL/browser history/server logs.
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [createdEmailSent, setCreatedEmailSent] = useState(false);

  const detailPanel = useResizable({
    defaultSize: 360,
    maxSizePx: 500,
    minSizePx: 280,
  });

  // PowerSearch's field-based filtering wants plain present values, not
  // optional/undefined ones — these fallbacks are the same text the panel
  // would otherwise show, applied once here so the filtered data and the
  // detail panel never disagree.
  const rows = useMemo<InviteRow[]>(
    () =>
      (invites ?? []).map((invite) => ({
        ...invite,
        createdByEmail:
          invite.createdByEmail ?? m.admin_invites_unknown_creator(),
        email: invite.email ?? m.admin_invites_unknown_creator(),
        role: invite.role as InviteRow["role"],
      })),
    [invites]
  );

  const filteredInvites = useMemo(
    () => applyFilters(filters, rows),
    [rows, filters, applyFilters]
  );

  if (invites === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.admin_invites_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Layout
        content={
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
          <LayoutContent padding={0} role="main">
            <InvitesTable
              onSelectInvite={setSelectedInvite}
              rows={filteredInvites}
            />
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
          <>
            <LayoutHeader padding={4}>
              <HStack gap={3} vAlign="center">
                <StackItem size="fill">
                  <VStack gap={2}>
                    <Heading level={1}>{m.nav_invites()}</Heading>
                    <Text color="secondary">
                      {m.admin_invites_page_subtitle()}
                    </Text>
                  </VStack>
                </StackItem>
                <Button
                  label={m.admin_invites_create_button()}
                  onClick={() =>
                    navigate({
                      search: (prev) => ({ ...prev, modal: "create" }),
                    })
                  }
                  variant="primary"
                />
              </HStack>
            </LayoutHeader>
            <Toolbar
              dividers={["bottom"]}
              label={m.nav_invites()}
              startContent={
                <StackItem size="fill">
                  <PowerSearch
                    config={config}
                    filters={filters}
                    onChange={(newFilters) => setFilters([...newFilters])}
                    placeholder={m.admin_invites_search_placeholder()}
                    popoverSaveButtonLabel={m.apply()}
                    resultCount={filteredInvites.length}
                  />
                </StackItem>
              }
            />
          </>
        }
        height="fill"
      />

      <InviteFormDialog
        isOpen={isCreateOpen}
        onClose={closeCreateDialog}
        onCreated={(link, emailSent) => {
          closeCreateDialog();
          setCreatedLink(link);
          setCreatedEmailSent(emailSent);
        }}
      />
      <InviteLinkDialog
        emailSent={createdEmailSent}
        link={createdLink}
        onClose={() => setCreatedLink(null)}
      />
    </Section>
  );
};

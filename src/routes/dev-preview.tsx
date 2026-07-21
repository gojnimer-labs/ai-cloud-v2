// TEMPORARY dev-only preview route — NOT part of the redesign, do not commit.
// Renders the new WorkloadCard/PresetItem components directly with mock
// props (no Convex query data needed) so the redesign can be eyeballed in a
// real browser through the normal app boot (main.tsx/router/CSS/theme),
// unlike a standalone Vite entry which doesn't go through the same pipeline.
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Item } from "@astryxdesign/core/Item";
import { OverflowList } from "@astryxdesign/core/OverflowList";
import { Section } from "@astryxdesign/core/Section";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowPathIcon,
  InformationCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { PresetItem } from "@/entities/preset";
import { WorkloadCard } from "@/entities/workload";

// Same image on every workload example — isolating the status-mode
// treatment (enabled/loading/disabled) as the only variable between cards.
const SAME_IMG =
  "https://convex-ai-cloud.390e5ca7a3b0c6d1739759981dbcf719.r2.cloudflarestorage.com/ca73a869-9d14-4bbe-8883-bf8fdf8ff724?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=148f2b5963ad04c8e626bc2fa25b6ca3%2F20260721%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20260721T041254Z&X-Amz-Expires=3600&X-Amz-Signature=83c61ec9da34ef3f0b627e97ffce965c67f2c1a5c9397d8de8b324300767d119&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject";

const menuItems = [
  { icon: ArrowPathIcon, label: "Redeploy", onClick: () => {} },
  { type: "divider" as const },
  { icon: TrashIcon, label: "Delete", onClick: () => {} },
];

const DevPreviewPage = () => (
  <Section height="100%" padding={6} variant="transparent">
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={1}>Workspace</Heading>
        <Text color="secondary">
          One-click deploy a preset shared with one of your groups.
        </Text>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Available</Heading>
        <Grid columns={{ minWidth: 280 }} gap={4}>
          <PresetItem
            isDeploying={false}
            onDeploy={() => {}}
            preset={{
              _id: "preset1",
              displayName: "Firefox Browser",
              groups: [{ _id: "g1", badgeColor: "blue", name: "Engineering" }],
              templateId: "firefox",
              thumbnailUrl: null,
            }}
          />
          <PresetItem
            isDeploying={true}
            onDeploy={() => {}}
            preset={{
              _id: "preset2",
              displayName: "No Thumbnail Preset",
              groups: [],
              templateId: "nginx",
              thumbnailUrl: null,
            }}
          />
        </Grid>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Your workspaces</Heading>
        <Grid columns={{ minWidth: 100 }} gap={4}>
          <WorkloadCard
            interactionState="ready"
            menuItems={menuItems}
            onOpen={() => {}}
            onResume={undefined}
            onUpdate={undefined}
            statusLabel="Active"
            workload={{
              _id: "workload-ready",
              displayName: "Claude Code",
              groups: [
                { _id: "g1", badgeColor: "blue", name: "Engineering" },
                { _id: "g3", badgeColor: "purple", name: "Design" },
                { _id: "g4", badgeColor: "red", name: "Ops" },
              ],
              hasPresetUpdate: false,
              presetVersion: 3,
              sourcePresetDisplayName: "Firefox Browser",
              status: "active",
              templateId: "firefox",
              templateVersion: "1.2.0",
              thumbnailUrl: SAME_IMG,
            }}
          />
          <WorkloadCard
            interactionState="in-flight"
            menuItems={menuItems}
            onOpen={undefined}
            onResume={undefined}
            onUpdate={undefined}
            statusLabel="Provisioning"
            workload={{
              _id: "workload-in-flight",
              displayName: "nginx-sandbox",
              groups: [],
              hasPresetUpdate: false,
              presetVersion: 1,
              sourcePresetDisplayName: "Nginx Preset",
              status: "provisioning",
              templateId: "nginx",
              templateVersion: "2",
              thumbnailUrl: SAME_IMG,
            }}
          />
          <WorkloadCard
            interactionState="paused"
            menuItems={menuItems}
            onOpen={undefined}
            onResume={() => {}}
            onUpdate={undefined}
            statusLabel="Stopped"
            workload={{
              _id: "workload-paused",
              displayName: "chrome-vm",
              groups: [{ _id: "g1", badgeColor: "blue", name: "Engineering" }],
              hasPresetUpdate: false,
              presetVersion: 2,
              sourcePresetDisplayName: "Chrome Preset",
              status: "stopped",
              templateId: "chrome",
              templateVersion: "5.0",
              thumbnailUrl: SAME_IMG,
            }}
          />
          <WorkloadCard
            interactionState="attention"
            menuItems={menuItems}
            onOpen={undefined}
            onResume={undefined}
            onUpdate={undefined}
            statusLabel="Failed"
            workload={{
              _id: "workload-attention",
              displayName: "my-attention",
              groups: [
                { _id: "g2", badgeColor: "red", name: "Ops" },
                { _id: "g1", badgeColor: "blue", name: "Engineering" },
              ],
              hasPresetUpdate: false,
              presetVersion: 3,
              sourcePresetDisplayName: "Firefox Browser",
              status: "failed",
              templateId: "firefox",
              templateVersion: "1.2.0",
              thumbnailUrl: SAME_IMG,
            }}
          />
          <WorkloadCard
            interactionState="update-available"
            menuItems={menuItems}
            onOpen={undefined}
            onResume={undefined}
            onUpdate={() => {}}
            statusLabel="Active"
            workload={{
              _id: "workload-update-available",
              displayName: "my-update",
              groups: [{ _id: "g1", badgeColor: "blue", name: "Engineering" }],
              hasPresetUpdate: true,
              presetVersion: 3,
              sourcePresetDisplayName: "Firefox Browser",
              status: "active",
              templateId: "firefox",
              templateVersion: "1.2.0",
              thumbnailUrl: SAME_IMG,
            }}
          />
        </Grid>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>HoverCard body — workload details</Heading>
        <Text color="secondary">Hover the (i) icon below to open it.</Text>
        <VStack hAlign="start" style={{ paddingLeft: 24 }}>
          <HoverCard
            content={
              <VStack gap={3} style={{ width: 260 }}>
                <HStack gap={3} justify="between" vAlign="center">
                  <HStack gap={2} vAlign="end">
                    <Heading level={4}>Claude Code</Heading>
                    <Text type="supporting">firefox · v1.2.0</Text>
                  </HStack>
                  <Badge label="v3" variant="neutral" />
                </HStack>
                <HStack gap={3} justify="between" vAlign="center">
                  <HStack gap={1} vAlign="center">
                    <StatusDot label="Active" variant="success" />
                    <Text color="secondary" type="supporting">
                      Active
                    </Text>
                  </HStack>
                  <OverflowList
                    gap={1}
                    overflowRenderer={(overflowItems) => (
                      <Text color="secondary" type="supporting">
                        +{overflowItems.length}
                      </Text>
                    )}
                    style={{ minWidth: 0 }}
                  >
                    <Badge label="Kotas" variant="green" />
                    <Badge label="Design" variant="purple" />
                    <Badge label="Ops" variant="red" />
                  </OverflowList>
                </HStack>
                <Center axis="horizontal">
                  <Text color="secondary" type="supporting">
                    Click to open
                  </Text>
                </Center>
              </VStack>
            }
            isDefaultOpen
            placement="end"
          >
            <IconButton
              icon={<InformationCircleIcon />}
              label="Workspace details"
              variant="ghost"
            />
          </HoverCard>
        </VStack>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>HoverCard body — ERROR state (WIP)</Heading>
        <Text color="secondary">
          Same structure as the healthy version for now — anchored on the
          warning icon itself instead of the whole thumbnail (attention's
          Thumbnail is isDisabled/non-interactive). Hover the warning icon
          below to open it.
        </Text>
        <VStack hAlign="start" style={{ paddingLeft: 24 }}>
          <HoverCard
            content={
              <VStack gap={3} style={{ width: 260 }}>
                <HStack gap={3} justify="between" vAlign="center">
                  <HStack gap={2} vAlign="end">
                    <Heading level={4}>my-broken-one</Heading>
                    <Text type="supporting">nginx · v2</Text>
                  </HStack>
                  <Badge label="v1" variant="neutral" />
                </HStack>
                <HStack gap={3} justify="between" vAlign="center">
                  <HStack gap={1} vAlign="center">
                    <StatusDot label="Failed" variant="error" />
                    <Text color="secondary" type="supporting">
                      Failed
                    </Text>
                  </HStack>
                  <OverflowList
                    gap={1}
                    overflowRenderer={(overflowItems) => (
                      <Text color="secondary" type="supporting">
                        +{overflowItems.length}
                      </Text>
                    )}
                    style={{ minWidth: 0 }}
                  >
                    <Badge label="Ops" variant="red" />
                    <Badge label="Engineering" variant="blue" />
                  </OverflowList>
                </HStack>
                <Divider />
                <Item
                  density="compact"
                  description="Retry after checking service credentials"
                  label="Sync failed"
                  startContent={
                    <Icon color="error" icon="error" size="sm" />
                  }
                  style={{ padding: 0 }}
                />
                <HStack justify="center">
                  <Button
                    isDisabled
                    label="Report"
                    size="sm"
                    variant="ghost"
                  />
                </HStack>
              </VStack>
            }
            isDefaultOpen
            placement="end"
          >
            <IconButton
              icon={<Icon color="warning" icon="warning" size="sm" />}
              label="Workspace error details"
              variant="ghost"
            />
          </HoverCard>
        </VStack>
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>Empty state reference</Heading>
        <EmptyState
          description="Deploy a preset above to see it show up here."
          title="No workspaces yet"
        />
      </VStack>
    </VStack>
  </Section>
);

export const Route = createFileRoute("/dev-preview")({
  component: DevPreviewPage,
});

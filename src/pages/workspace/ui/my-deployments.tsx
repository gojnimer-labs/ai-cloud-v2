import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

import { m } from "@/paraglide/messages";

import {
  formatDate,
  workloadStatusIsPulsing,
  workloadStatusLabel,
  workloadStatusVariant,
} from "../model/format";

// A user's own deployed instances, live-updating as claim/heartbeat moves
// each one through requested -> provisioning -> active — so a workload
// deployed from a preset shows up here immediately, not just on the admin
// Fleet page. Deliberately a plain dense List (edge-to-edge rows), not the
// PresetItem card grid above it on the page: these are two different kinds
// of thing (a catalog entry to deploy vs. an instance already running).
export const MyDeployments = () => {
  const workloads = useQuery(api.workloads.queries.listMine);

  if (!workloads || workloads.length === 0) {
    return null;
  }

  return (
    <List
      hasDividers
      header={<Heading level={3}>{m.workspace_my_deployments_title()}</Heading>}
    >
      {workloads.map((workload) => (
        <ListItem
          description={workload.templateId}
          endContent={
            <HStack gap={2} vAlign="center">
              <Text color="secondary" type="supporting">
                {formatDate(workload.createdAt)}
              </Text>
              <StatusDot
                isPulsing={workloadStatusIsPulsing(workload.status)}
                label={workloadStatusLabel(workload.status)}
                variant={workloadStatusVariant(workload.status)}
              />
              <Text>{workloadStatusLabel(workload.status)}</Text>
            </HStack>
          }
          key={workload._id}
          label={workload.displayName}
        />
      ))}
    </List>
  );
};

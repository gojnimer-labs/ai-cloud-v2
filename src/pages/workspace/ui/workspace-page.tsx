import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";

import { PresetItem } from "@/entities/preset";
import { WorkloadCard } from "@/entities/workload";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import {
  workloadInteractionState,
  workloadStatusLabel,
} from "../model/format";
import { useWorkloadActions } from "../model/use-workload-actions";
import { CardSkeletonGrid } from "./card-skeleton";

// Two independent sections, each a thumbnail-centric Grid, never a table or
// list: "Available" (catalog presets to deploy — PresetItem) and "Your
// workspaces" (ongoing, non-destroyed instances — WorkloadCard). The two
// underlying queries resolve independently, so one section's skeleton grid
// can still be showing while the other has already rendered real cards —
// no shared page-level loading gate.
export const WorkspacePage = () => {
  const presets = useQuery(
    api.presets.queries.listAvailablePresetsForCurrentUser
  );
  const workloads = useQuery(api.workloads.queries.listMine);
  const deployPreset = useAction(api.presets.actions.deployPreset);
  const toast = useToast();
  const [deployingId, setDeployingId] = useState<Id<"presets"> | null>(null);

  const { buildMenuItems, dialogsElement, resolveCardInteraction } =
    useWorkloadActions();

  const handleDeploy = async (presetId: Id<"presets">) => {
    setDeployingId(presetId);
    try {
      await deployPreset({ presetId });
      toast({ body: m.workspace_deploy_success() });
    } catch (error) {
      toast({
        body: m.workspace_deploy_error({ error: getErrorMessage(error) }),
        type: "error",
      });
    } finally {
      setDeployingId(null);
    }
  };

  const renderPresetsSection = () => {
    if (presets === undefined) {
      return <CardSkeletonGrid hasActionRow />;
    }
    if (presets.length === 0) {
      return (
        <EmptyState
          description={m.workspace_empty_description()}
          title={m.workspace_empty_title()}
        />
      );
    }
    return (
      <Grid columns={{ minWidth: 280 }} gap={4}>
        {presets.map((preset) => (
          <PresetItem
            isDeploying={deployingId === preset._id}
            key={preset._id}
            onDeploy={() => handleDeploy(preset._id)}
            preset={preset}
          />
        ))}
      </Grid>
    );
  };

  const renderWorkloadsSection = () => {
    if (workloads === undefined) {
      return <CardSkeletonGrid />;
    }
    if (workloads.length === 0) {
      return (
        <EmptyState
          description={m.workspace_workloads_empty_description()}
          title={m.workspace_workloads_empty_title()}
        />
      );
    }
    return (
      <Grid columns={{ minWidth: 280 }} gap={4}>
        {workloads.map((workload) => {
          const { entrypoints, onResume, onUpdate } =
            resolveCardInteraction(workload);
          return (
            <WorkloadCard
              interactionState={workloadInteractionState(
                workload.status,
                workload.hasPresetUpdate
              )}
              key={workload._id}
              menuItems={buildMenuItems(workload)}
              onOpen={entrypoints[0]?.onSelect}
              onResume={onResume}
              onUpdate={onUpdate}
              statusLabel={workloadStatusLabel(workload.status)}
              workload={workload}
            />
          );
        })}
      </Grid>
    );
  };

  return (
    <Section height="100%" padding={6} variant="transparent">
      <VStack gap={6}>
        <VStack gap={2}>
          <Heading level={1}>{m.workspace_page_title()}</Heading>
          <Text color="secondary">{m.workspace_page_subtitle()}</Text>
        </VStack>

        <VStack gap={3}>
          <Heading level={2}>{m.workspace_available_section_title()}</Heading>
          {renderPresetsSection()}
        </VStack>

        <VStack gap={3}>
          <Heading level={2}>
            {m.workspace_your_workspaces_section_title()}
          </Heading>
          {renderWorkloadsSection()}
        </VStack>
      </VStack>

      {dialogsElement}
    </Section>
  );
};

import { Carousel } from "@astryxdesign/core/Carousel";
import { Divider } from "@astryxdesign/core/Divider";
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

import { workloadInteractionState, workloadStatusLabel } from "../model/format";
import { useWorkloadActions } from "../model/use-workload-actions";
import {
  PresetCarouselSkeleton,
  WorkloadCardSkeletonGrid,
} from "./card-skeleton";

// Two independent, thumbnail-centric sections, never a table or list:
// presets to deploy (PresetItem) scroll in a horizontal Carousel — better
// for mobile widths and it reads as a catalog, not a dashboard — while
// running workspaces (WorkloadCard) stay a wrapping Grid. The two underlying
// queries resolve independently, so one section's skeleton can still be
// showing while the other has already rendered real cards — no shared
// page-level loading gate.
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
      return <PresetCarouselSkeleton />;
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
      <Carousel aria-label={m.workspace_available_presets_aria_label()} gap={4}>
        {presets.map((preset) => (
          <PresetItem
            isDeploying={deployingId === preset._id}
            key={preset._id}
            onDeploy={() => handleDeploy(preset._id)}
            preset={preset}
          />
        ))}
      </Carousel>
    );
  };

  const renderWorkloadsSection = () => {
    if (workloads === undefined) {
      return <WorkloadCardSkeletonGrid />;
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
      <Grid columns={{ minWidth: 100 }} gap={2}>
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

        {renderPresetsSection()}

        <Divider label={m.workspace_running_workspaces_section_title()} />

        {renderWorkloadsSection()}
      </VStack>

      {dialogsElement}
    </Section>
  );
};

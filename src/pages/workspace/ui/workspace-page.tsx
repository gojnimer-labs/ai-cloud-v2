import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";

import { PresetItem } from "@/entities/preset";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

import { MyDeployments } from "./my-deployments";

export const WorkspacePage = () => {
  const presets = useQuery(
    api.presets.queries.listAvailablePresetsForCurrentUser
  );
  const deployPreset = useAction(api.presets.actions.deployPreset);
  const toast = useToast();
  const [deployingId, setDeployingId] = useState<Id<"presets"> | null>(null);

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

  if (presets === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">{m.workspace_loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <VStack gap={4}>
        <VStack gap={2}>
          <Heading level={1}>{m.workspace_page_title()}</Heading>
          <Text color="secondary">{m.workspace_page_subtitle()}</Text>
        </VStack>

        {presets.length === 0 ? (
          <Center axis="both" style={{ minHeight: 240 }}>
            <EmptyState
              description={m.workspace_empty_description()}
              title={m.workspace_empty_title()}
            />
          </Center>
        ) : (
          <HStack gap={4} wrap="wrap">
            {presets.map((preset) => (
              <PresetItem
                isDeploying={deployingId === preset._id}
                key={preset._id}
                onDeploy={() => handleDeploy(preset._id)}
                preset={preset}
              />
            ))}
          </HStack>
        )}

        <MyDeployments />
      </VStack>
    </Section>
  );
};

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { List, ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useToast } from "@astryxdesign/core/Toast";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

// Every presetVersions row for this preset, newest first — lets an admin
// promote an older snapshot back to current without re-entering its
// params by hand. "Promote" always creates a NEW version copying the
// target's shape (see convex/presets/mutations.ts#promotePresetVersion's
// doc comment) rather than rewinding currentVersion, so this list only ever
// grows, never reorders.
export const PresetVersionHistory = ({
  currentVersion,
  presetId,
}: {
  currentVersion: number;
  presetId: Id<"presets">;
}) => {
  const versions = useQuery(api.presets.queries.listPresetVersions, {
    presetId,
  });
  const promoteVersion = useMutation(
    api.presets.mutations.promotePresetVersion
  );
  const [promotingVersionId, setPromotingVersionId] =
    useState<Id<"presetVersions"> | null>(null);
  const toast = useToast();

  const handlePromote = async (versionId: Id<"presetVersions">) => {
    setPromotingVersionId(versionId);
    try {
      await promoteVersion({ presetId, versionId });
      toast({ body: m.admin_presets_version_history_promote_success() });
    } catch (error) {
      toast({
        body: m.admin_presets_version_history_promote_error({
          error: getErrorMessage(error),
        }),
        type: "error",
      });
    } finally {
      setPromotingVersionId(null);
    }
  };

  if (!versions) {
    return null;
  }

  return (
    <List
      header={
        <Text weight="bold">{m.admin_presets_version_history_label()}</Text>
      }
    >
      {versions.map((version) => (
        <ListItem
          description={`${version.templateId} · v${version.templateVersion}`}
          endContent={
            version.version === currentVersion ? (
              <Badge
                label={m.admin_presets_version_history_current()}
                variant="neutral"
              />
            ) : (
              <Button
                isDisabled={promotingVersionId !== null}
                label={m.admin_presets_version_history_promote()}
                onClick={() => handlePromote(version._id)}
                size="sm"
                variant="secondary"
              />
            )
          }
          key={version._id}
          label={
            <>
              {`v${version.version}`}
              {" · "}
              <Timestamp value={new Date(version.createdAt).toISOString()} />
            </>
          }
        />
      ))}
    </List>
  );
};

import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";

import type { MergedCatalogEntry } from "../model/types";

// Selection key mirrors listMergedCatalog's own dedup key — two cards can
// share a templateId (different versions), so id alone can't identify one.
export const entryKey = (entry: { id: string; version: string }): string =>
  `${entry.id}@${entry.version}`;

export const TemplatePicker = ({
  onSelect,
  selectedKey,
}: {
  onSelect: (entry: MergedCatalogEntry) => void;
  selectedKey: string | null;
}) => {
  const catalog = useQuery(api.operators.queries.listMergedCatalog);

  if (!catalog) {
    return <Text color="secondary">Loading catalog…</Text>;
  }

  if (catalog.length === 0) {
    return (
      <Text color="secondary">No operators have reported a catalog yet.</Text>
    );
  }

  return (
    <Grid columns={{ max: 3, minWidth: 220 }} gap={3}>
      {catalog.map((entry) => {
        const key = entryKey(entry);
        return (
          <SelectableCard
            isSelected={key === selectedKey}
            key={key}
            label={`${entry.name} version ${entry.version}`}
            onChange={() => onSelect(entry)}
          >
            <VStack gap={1}>
              <Heading level={4}>
                {entry.icon} {entry.name}
              </Heading>
              <Text color="secondary" type="supporting">
                {entry.description}
              </Text>
              <Text color="secondary" type="supporting">
                v{entry.version} · {entry.operatorCount} operator
                {entry.operatorCount === 1 ? "" : "s"}
              </Text>
            </VStack>
          </SelectableCard>
        );
      })}
    </Grid>
  );
};

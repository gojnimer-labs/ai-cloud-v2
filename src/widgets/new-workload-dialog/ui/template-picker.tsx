import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import type { MergedCatalogEntry } from "../model/types";

// Selection key mirrors listMergedCatalog's own dedup key — two cards can
// share a templateId (different versions), so id alone can't identify one.
export const entryKey = (entry: { id: string; version: string }): string =>
  `${entry.id}@${entry.version}`;

// Matches the width below which the multi-column Grid has nowhere left to
// shrink to — under this, a card-per-row VStack (a real flex column, each
// card width="100%") reliably fills the row on every device, where Grid's
// minmax-based track sizing was still leaving cards short of full width.
const MOBILE_QUERY = "(max-width: 640px)";

const TemplateCard = ({
  entry,
  isSelected,
  onSelect,
  width,
}: {
  entry: MergedCatalogEntry;
  isSelected: boolean;
  onSelect: (entry: MergedCatalogEntry) => void;
  width?: string;
}) => (
  <SelectableCard
    isSelected={isSelected}
    label={`${entry.name} version ${entry.version}`}
    onChange={() => onSelect(entry)}
    width={width}
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

const renderResults = ({
  filtered,
  isMobile,
  onSelect,
  search,
  selectedKey,
}: {
  filtered: MergedCatalogEntry[];
  isMobile: boolean;
  onSelect: (entry: MergedCatalogEntry) => void;
  search: string;
  selectedKey: string | null;
}) => {
  if (filtered.length === 0) {
    return (
      <Text color="secondary">No templates match &quot;{search}&quot;.</Text>
    );
  }

  if (isMobile) {
    // A real flex column below MOBILE_QUERY — each card gets width="100%" so
    // it always fills the row, rather than relying on Grid's minmax-based
    // track sizing at a width it doesn't shrink well past.
    return (
      <VStack gap={3}>
        {filtered.map((entry) => (
          <TemplateCard
            entry={entry}
            isSelected={entryKey(entry) === selectedKey}
            key={entryKey(entry)}
            onSelect={onSelect}
            width="100%"
          />
        ))}
      </VStack>
    );
  }

  return (
    <Grid columns={{ max: 4, minWidth: 240, repeat: "fit" }} gap={3}>
      {filtered.map((entry) => (
        <TemplateCard
          entry={entry}
          isSelected={entryKey(entry) === selectedKey}
          key={entryKey(entry)}
          onSelect={onSelect}
          width="1fr"
        />
      ))}
    </Grid>
  );
};

export const TemplatePicker = ({
  onSelect,
  selectedKey,
}: {
  onSelect: (entry: MergedCatalogEntry) => void;
  selectedKey: string | null;
}) => {
  const catalog = useQuery(api.operators.queries.listMergedCatalog);
  const [search, setSearch] = useState("");
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return catalog ?? [];
    }
    return (catalog ?? []).filter(
      (entry) =>
        entry.name.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query)
    );
  }, [catalog, search]);

  if (!catalog) {
    return <Text color="secondary">Loading catalog…</Text>;
  }

  if (catalog.length === 0) {
    return (
      <Text color="secondary">No operators have reported a catalog yet.</Text>
    );
  }

  return (
    <VStack gap={3}>
      <TextInput
        isLabelHidden
        label="Search templates"
        onChange={setSearch}
        placeholder="Search templates…"
        startIcon={MagnifyingGlassIcon}
        value={search}
      />
      {renderResults({
        filtered,
        isMobile,
        onSelect,
        search,
        selectedKey,
      })}
    </VStack>
  );
};

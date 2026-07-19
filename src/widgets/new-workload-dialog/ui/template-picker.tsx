import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import type { MergedCatalogEntry } from "../model/types";

// Selection key mirrors listMergedCatalog's own dedup key — two cards can
// share a templateId (different versions), so id alone can't identify one.
export const entryKey = (entry: { id: string; version: string }): string =>
  `${entry.id}@${entry.version}`;

// Flexbox, not Grid: CSS Grid's column tracks are shared by every row, so
// once one row fills all of them, a shorter trailing row can't shrink the
// grid to match — a lone leftover card is stranded next to blank space
// with no way to fix it from CSS alone. A flex-wrap row distributes
// leftover space per line instead of per grid, so a partial row's cards
// grow to fill it exactly like a full row would — on any card count and
// any container width, mobile included, with no JS measurement needed.
const cardStyles = stylex.create({
  flexItem: {
    flexBasis: "240px",
    flexGrow: 1,
    flexShrink: 1,
  },
});

const TemplateCard = ({
  entry,
  isSelected,
  onSelect,
}: {
  entry: MergedCatalogEntry;
  isSelected: boolean;
  onSelect: (entry: MergedCatalogEntry) => void;
}) => (
  <SelectableCard
    isSelected={isSelected}
    label={`${entry.name} version ${entry.version}`}
    onChange={() => onSelect(entry)}
    xstyle={cardStyles.flexItem}
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
  onSelect,
  search,
  selectedKey,
}: {
  filtered: MergedCatalogEntry[];
  onSelect: (entry: MergedCatalogEntry) => void;
  search: string;
  selectedKey: string | null;
}) => {
  if (filtered.length === 0) {
    return (
      <Text color="secondary">No templates match &quot;{search}&quot;.</Text>
    );
  }

  return (
    <HStack gap={3} wrap="wrap">
      {filtered.map((entry) => (
        <TemplateCard
          entry={entry}
          isSelected={entryKey(entry) === selectedKey}
          key={entryKey(entry)}
          onSelect={onSelect}
        />
      ))}
    </HStack>
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
        onSelect,
        search,
        selectedKey,
      })}
    </VStack>
  );
};

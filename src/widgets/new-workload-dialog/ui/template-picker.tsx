import { Grid, GridSpan } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useQuery } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";

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

// Grid's auto-fit tracks only collapse when a column is unused by every
// row — once row 1 fills all columns, a shorter trailing row can't shrink
// the grid's column count, so a lone leftover card sits stranded next to
// blank space. Reading the browser's own resolved column count (rather
// than reimplementing Grid's minmax/gap math) lets renderResults span the
// trailing row's cards across the leftover tracks so they fill it instead.
//
// A callback ref (not a plain ref + effect) because the Grid node mounts
// and unmounts as isMobile/filtered toggle which layout renders — a plain
// ref's identity never changes across those swaps, so an effect keyed on
// it would only ever attach once and miss every later (re)mount.
const useGridColumnCount = (): [
  (node: HTMLDivElement | null) => void,
  number,
] => {
  const [columnCount, setColumnCount] = useState(1);
  const observerRef = useRef<ResizeObserver | null>(null);

  const gridRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) {
      return;
    }
    const measure = () => {
      const template = getComputedStyle(node).gridTemplateColumns;
      setColumnCount(template.split(" ").filter(Boolean).length || 1);
    };
    measure();
    observerRef.current = new ResizeObserver(measure);
    observerRef.current.observe(node);
  }, []);

  return [gridRef, columnCount];
};

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
  columnCount,
  filtered,
  gridRef,
  isMobile,
  onSelect,
  search,
  selectedKey,
}: {
  columnCount: number;
  filtered: MergedCatalogEntry[];
  gridRef: (node: HTMLDivElement | null) => void;
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

  // Only the trailing row can be ragged (every prior row is, by
  // definition, full) — split off just those cards and spread them evenly
  // across the leftover columns via GridSpan so the row fills edge to edge.
  const trailingCount =
    columnCount > 1 && filtered.length > columnCount
      ? filtered.length % columnCount
      : 0;
  const leading =
    trailingCount > 0 ? filtered.slice(0, -trailingCount) : filtered;
  const trailing = trailingCount > 0 ? filtered.slice(-trailingCount) : [];

  return (
    <Grid
      columns={{ max: 4, minWidth: 240, repeat: "fit" }}
      gap={3}
      ref={gridRef}
    >
      {leading.map((entry) => (
        <TemplateCard
          entry={entry}
          isSelected={entryKey(entry) === selectedKey}
          key={entryKey(entry)}
          onSelect={onSelect}
          width="1fr"
        />
      ))}
      {trailing.map((entry, index) => {
        const span =
          Math.floor(columnCount / trailingCount) +
          (index === trailingCount - 1 ? columnCount % trailingCount : 0);
        return (
          <GridSpan columns={span} key={entryKey(entry)}>
            <TemplateCard
              entry={entry}
              isSelected={entryKey(entry) === selectedKey}
              onSelect={onSelect}
              width="100%"
            />
          </GridSpan>
        );
      })}
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
  const [gridRef, columnCount] = useGridColumnCount();

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
        columnCount,
        filtered,
        gridRef,
        isMobile,
        onSelect,
        search,
        selectedKey,
      })}
    </VStack>
  );
};

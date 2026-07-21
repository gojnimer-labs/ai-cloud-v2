import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Section } from "@astryxdesign/core/Section";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import type { Ref } from "react";
import { Suspense, use, useCallback, useMemo, useRef, useState } from "react";

import type { CatalogTemplate } from "@/entities/catalog-parameter";
import { getErrorMessage } from "@/shared/lib/get-error-message";
import { MOBILE_QUERY } from "@/shared/lib/media-queries";

import type { MergedCatalogEntry } from "../model/types";
import type { DeployWorkloadFieldsHandle } from "./deploy-workload-form";
import { DeployWorkloadFields } from "./deploy-workload-form";
import { entryKey, TemplatePicker } from "./template-picker";

const NAME_ADJECTIVES = [
  "clever",
  "brisk",
  "quiet",
  "bold",
  "lucky",
  "calm",
  "swift",
  "bright",
];
const NAME_ANIMALS = [
  "fox",
  "otter",
  "lynx",
  "heron",
  "wren",
  "panda",
  "falcon",
  "seal",
];

// A friendly placeholder shown in the display-name field, never sent as a real
// value unless the user actually types it — requestCreate already generates its
// own fallback (`${templateId}-${randomSuffix}`) server-side when displayName is
// omitted entirely, so this is purely a nicer suggestion, not a required input.
const suggestDisplayName = (): string => {
  const adjective =
    NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const animal = NAME_ANIMALS[Math.floor(Math.random() * NAME_ANIMALS.length)];
  const suffix = Math.floor(Math.random() * 90 + 10);
  return `${adjective}-${animal}-${suffix}`;
};

const emptyState = () => ({
  desiredOperatorTags: [] as string[],
  displayName: "",
  displayNameSuggestion: suggestDisplayName(),
  error: null as string | null,
  isParamsValid: false,
  selectedEntry: null as MergedCatalogEntry | null,
});

// Suspends on `promise` until the template resolves, rendering the real
// parameter fields only once it's ready — the loading state lives here, at
// the point of use in the form panel, rather than disabling template
// selection while resolution is in flight (a card is always immediately
// clickable).
const ResolvedTemplateFields = ({
  fieldsRef,
  onValidityChange,
  promise,
}: {
  fieldsRef: Ref<DeployWorkloadFieldsHandle>;
  onValidityChange: (isValid: boolean) => void;
  promise: Promise<CatalogTemplate | null>;
}) => {
  const template = use(promise);
  if (!template) {
    return (
      <Text weight="medium">
        This template is no longer available — choose another from the list.
      </Text>
    );
  }
  return (
    <DeployWorkloadFields
      key={entryKey(template)}
      onValidityChange={onValidityChange}
      ref={fieldsRef}
      template={template}
    />
  );
};

export const NewWorkloadDialog = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [state, setState] = useState(emptyState);
  const [isDeploying, setIsDeploying] = useState(false);
  const fieldsRef = useRef<DeployWorkloadFieldsHandle>(null);

  const resolveMergedTemplate = useAction(
    api.operators.actions.resolveMergedTemplate
  );
  const requestWorkload = useAction(api.workloads.actions.requestWorkload);

  const reset = () => setState(emptyState());

  const handleClose = () => {
    reset();
    onClose();
  };

  // Kicked off the moment a card is picked in step 1 (not deferred to
  // entering step 2), so by the time the user reaches step 2 the promise
  // may already be resolved. Memoized on selectedEntry so the same promise
  // instance survives re-renders — use() re-suspends only when it actually
  // receives a new promise. Resolves dynamic/fileOptions parameter options
  // against the user's own selectOptions/files rows — see
  // operators/actions.ts#resolveMergedTemplate for why no operator needs to
  // be picked just to render this form.
  const templatePromise = useMemo(() => {
    if (!state.selectedEntry) {
      return null;
    }
    return resolveMergedTemplate({
      templateId: state.selectedEntry.id,
      templateVersion: state.selectedEntry.version,
    });
  }, [state.selectedEntry, resolveMergedTemplate]);

  const handleSelectEntry = (entry: MergedCatalogEntry | null) => {
    setState((prev) => ({ ...prev, error: null, selectedEntry: entry }));
  };

  // All registered tags across every operator, regardless of which
  // templates they serve — not scoped to the selected template's own
  // availableTags, per the multiselect's job of surfacing the full
  // registered vocabulary.
  const allTags = useQuery(api.operators.queries.listAllTags);

  // Stable across renders so DeployWorkloadFields's own effect (which
  // depends on this callback) only re-fires when form.isValid actually
  // changes — an inline arrow here would give it a new reference every
  // render, re-firing the effect every time, which calls setState here,
  // which re-renders this component, which creates a new inline arrow...
  // an infinite update loop (React error #185).
  const handleValidityChange = useCallback((isParamsValid: boolean) => {
    setState((prev) => ({ ...prev, isParamsValid }));
  }, []);

  const handleDeploy = async () => {
    const { selectedEntry } = state;
    if (!selectedEntry) {
      return;
    }
    // Null while the template is still resolving (or was never found) —
    // Deploy stays disabled via isParamsValid until DeployWorkloadFields
    // actually mounts and reports validity, so this is just a defensive
    // guard against a stale ref, not the primary gate.
    const fields = fieldsRef.current;
    if (!fields || !(await fields.submit())) {
      return;
    }
    setIsDeploying(true);
    try {
      await requestWorkload({
        desiredOperatorTags: state.desiredOperatorTags,
        displayName: state.displayName.trim() || undefined,
        params: fields.getValues(),
        templateId: selectedEntry.id,
        templateVersion: selectedEntry.version,
      });
      reset();
      onClose();
    } catch (caughtError) {
      const message = getErrorMessage(caughtError);
      setState({ ...state, error: message });
    } finally {
      setIsDeploying(false);
    }
  };

  const { selectedEntry } = state;
  // Below this, a fixed-width side-by-side template list + form panel has
  // nowhere to fit — the two panels stack vertically instead.
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const listSection = (
    <VStack gap={3}>
      {!selectedEntry && state.error ? (
        <Text weight="medium">{state.error}</Text>
      ) : null}
      <TemplatePicker
        onSelect={handleSelectEntry}
        selectedKey={selectedEntry ? entryKey(selectedEntry) : null}
      />
    </VStack>
  );

  // The Create button lives inside the form pane itself (not a shared
  // dialog-wide footer) so it's scoped to the form's own width and pinned
  // below the SAME scrollable region as the fields — StackItem(fill,
  // isScrollable) gives that region flex:1 + min-height:0 + overflow:auto
  // entirely via props, so the button never scrolls out of view. This
  // composes as a VStack rather than a nested Layout because Layout
  // explicitly warns against nesting itself (one Layout per shell); the
  // "fill" behavior only actually applies once selectedEntry gives the
  // pane a definite height context (desktop's start/content split) — on
  // mobile, where list and form stack in one naturally-flowing column,
  // height="100%" resolves to auto and this just renders as a normal
  // trailing button instead of a sticky one, which is an acceptable
  // degrade rather than something to fight.
  const formSection = selectedEntry ? (
    <VStack height="100%">
      <StackItem isScrollable size="fill">
        <VStack gap={3}>
          <TextInput
            label="Name"
            onChange={(displayName) =>
              setState((prev) => ({ ...prev, displayName }))
            }
            placeholder={state.displayNameSuggestion}
            value={state.displayName}
          />
          <MultiSelector
            hasSearch
            label="Operator tags"
            onChange={(desiredOperatorTags) =>
              setState((prev) => ({ ...prev, desiredOperatorTags }))
            }
            options={allTags ?? []}
            placeholder="Match operators by tag (leave empty to match any)"
            triggerDisplay="labels"
            value={state.desiredOperatorTags}
          />
          {templatePromise ? (
            <Suspense
              fallback={<Text color="secondary">Loading template…</Text>}
            >
              <ResolvedTemplateFields
                fieldsRef={fieldsRef}
                onValidityChange={handleValidityChange}
                promise={templatePromise}
              />
            </Suspense>
          ) : null}
          {state.error ? <Text weight="medium">{state.error}</Text> : null}
        </VStack>
      </StackItem>
      <Section dividers={["top"]} paddingBlock={4}>
        <Button
          isDisabled={isDeploying || !state.isParamsValid}
          label={isDeploying ? "Creating…" : "Create"}
          onClick={handleDeploy}
          size="lg"
          style={{ width: "100%" }}
          variant="primary"
        />
      </Section>
    </VStack>
  ) : (
    <EmptyState
      description="Choose a template from the list to configure and deploy a workload."
      isCompact
      title="Select a template"
    />
  );

  return (
    <Dialog
      isOpen={isOpen}
      maxHeight="90vh"
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
      purpose="form"
      width={960}
    >
      <Layout
        content={
          <LayoutContent>
            {isMobile ? (
              <VStack gap={4}>
                {listSection}
                {selectedEntry ? formSection : null}
              </VStack>
            ) : (
              formSection
            )}
          </LayoutContent>
        }
        header={
          <DialogHeader onOpenChange={handleClose} title="New Workload" />
        }
        height="fill"
        start={
          isMobile ? undefined : (
            <LayoutPanel hasDivider width={320}>
              {listSection}
            </LayoutPanel>
          )
        }
      />
    </Dialog>
  );
};

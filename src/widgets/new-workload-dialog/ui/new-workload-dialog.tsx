import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import type { Ref } from "react";
import { Suspense, use, useCallback, useMemo, useRef, useState } from "react";

import type { CatalogTemplate } from "@/entities/catalog-parameter";

import type { MergedCatalogEntry } from "../model/types";
import type { DeployWorkloadFieldsHandle } from "./deploy-workload-form";
import { DeployWorkloadFields } from "./deploy-workload-form";
import { entryKey, TemplatePicker } from "./template-picker";

// Hand-mirrors convex/workloads/actions.ts#TEMPLATE_VERSION_DRIFT_ERROR —
// the frontend has never imported action-internal strings/types from
// convex/, same convention as CatalogTemplate's own doc comment. Exact
// match (not substring) so the two call sites are easy to keep in sync
// deliberately.
const TEMPLATE_VERSION_DRIFT_ERROR =
  "The selected template version is no longer available; please choose a template again.";

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
  step: 1 as 1 | 2,
});

// Suspends on `promise` until the template resolves, rendering the real
// parameter fields only once it's ready — the loading state lives here, at
// the point of use in step 2, instead of on step 1's Next button (which
// used to disable itself and relabel to "Loading template…" while
// resolution was still in flight; Next is always immediately clickable now).
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
        This template is no longer available — go back and choose another.
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

  const handleSelectEntry = (entry: MergedCatalogEntry) => {
    setState((prev) => ({ ...prev, selectedEntry: entry }));
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
    if (!fieldsRef.current?.validate()) {
      return;
    }
    setIsDeploying(true);
    try {
      await requestWorkload({
        desiredOperatorTags: state.desiredOperatorTags,
        displayName: state.displayName.trim() || undefined,
        params: fieldsRef.current.getValues(),
        templateId: selectedEntry.id,
        templateVersion: selectedEntry.version,
      });
      reset();
      onClose();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "The deploy request failed.";
      // On a version-drift error, the selection went stale between step 1
      // and submit — force a real reselect rather than silently deploying a
      // different version.
      const nextState =
        message === TEMPLATE_VERSION_DRIFT_ERROR
          ? {
              ...emptyState(),
              desiredOperatorTags: state.desiredOperatorTags,
              displayName: state.displayName,
              displayNameSuggestion: state.displayNameSuggestion,
              error: message,
              step: 1 as const,
            }
          : { ...state, error: message };
      setState(nextState);
    } finally {
      setIsDeploying(false);
    }
  };

  const { selectedEntry, step } = state;
  const canAdvance = Boolean(selectedEntry);

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
      width={880}
    >
      <Layout
        content={
          <LayoutContent>
            {step === 1 ? (
              <VStack gap={3} minHeight="35vh">
                {state.error ? (
                  <Text weight="medium">{state.error}</Text>
                ) : null}
                <TemplatePicker
                  onSelect={handleSelectEntry}
                  selectedKey={selectedEntry ? entryKey(selectedEntry) : null}
                />
              </VStack>
            ) : (
              <VStack gap={3} minHeight="35vh">
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
                {state.error ? (
                  <Text weight="medium">{state.error}</Text>
                ) : null}
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <Toolbar
              endContent={
                step === 1 ? (
                  <Button
                    isDisabled={!canAdvance}
                    label="Next"
                    onClick={() =>
                      setState((prev) => ({ ...prev, error: null, step: 2 }))
                    }
                    variant="primary"
                  />
                ) : (
                  <Button
                    isDisabled={isDeploying || !state.isParamsValid}
                    label={isDeploying ? "Deploying…" : "Deploy"}
                    onClick={handleDeploy}
                    variant="primary"
                  />
                )
              }
              label="New workload actions"
              startContent={
                step === 1 ? (
                  <Button
                    label="Cancel"
                    onClick={handleClose}
                    variant="secondary"
                  />
                ) : (
                  <Button
                    label="Back"
                    onClick={() =>
                      setState((prev) => ({ ...prev, error: null, step: 1 }))
                    }
                    variant="secondary"
                  />
                )
              }
            />
          </LayoutFooter>
        }
        header={
          <DialogHeader onOpenChange={handleClose} title="New Workload" />
        }
      />
    </Dialog>
  );
};

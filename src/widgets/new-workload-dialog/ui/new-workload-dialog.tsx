import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Tokenizer } from "@astryxdesign/core/Tokenizer";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  resolvedTemplate: null as CatalogTemplate | null,
  selectedEntry: null as MergedCatalogEntry | null,
  step: 1 as 1 | 2,
});

export const NewWorkloadDialog = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [state, setState] = useState(emptyState);
  const [isResolving, setIsResolving] = useState(false);
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

  // Fires the moment a card is picked in step 1 (not deferred to entering
  // step 2), so step 2 opens with the form already ready. Resolves
  // dynamic/fileOptions parameter options against the user's own
  // selectOptions/files rows — see operators/actions.ts#resolveMergedTemplate
  // for why no operator needs to be picked just to render this form.
  useEffect(() => {
    const entry = state.selectedEntry;
    if (!entry) {
      return;
    }
    let cancelled = false;
    const resolve = async () => {
      setIsResolving(true);
      try {
        const template = await resolveMergedTemplate({
          templateId: entry.id,
          templateVersion: entry.version,
        });
        if (!cancelled) {
          setState((prev) => ({ ...prev, resolvedTemplate: template }));
        }
      } finally {
        if (!cancelled) {
          setIsResolving(false);
        }
      }
    };
    resolve();
    return () => {
      cancelled = true;
    };
  }, [state.selectedEntry, resolveMergedTemplate]);

  const handleSelectEntry = (entry: MergedCatalogEntry) => {
    setState((prev) => ({
      ...prev,
      resolvedTemplate: null,
      selectedEntry: entry,
    }));
  };

  const tagSearchSource = useMemo(() => {
    const available = state.selectedEntry?.availableTags ?? [];
    return {
      bootstrap: () => available.map((tag) => ({ id: tag, label: tag })),
      search: (query: string) =>
        available
          .filter((tag) => tag.toLowerCase().includes(query.toLowerCase()))
          .map((tag) => ({ id: tag, label: tag })),
    };
  }, [state.selectedEntry]);

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
    const { resolvedTemplate, selectedEntry } = state;
    if (!(selectedEntry && resolvedTemplate)) {
      return;
    }
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

  const { resolvedTemplate, selectedEntry, step } = state;
  const canAdvance = Boolean(selectedEntry && resolvedTemplate && !isResolving);

  return (
    <Dialog
      isOpen={isOpen}
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
              <VStack gap={3}>
                {state.error ? (
                  <Text weight="medium">{state.error}</Text>
                ) : null}
                <TemplatePicker
                  onSelect={handleSelectEntry}
                  selectedKey={selectedEntry ? entryKey(selectedEntry) : null}
                />
              </VStack>
            ) : (
              <VStack gap={3}>
                <TextInput
                  label="Name"
                  onChange={(displayName) =>
                    setState((prev) => ({ ...prev, displayName }))
                  }
                  placeholder={state.displayNameSuggestion}
                  value={state.displayName}
                />
                <Tokenizer
                  hasCreate
                  label="Operator tags"
                  onChange={(items) =>
                    setState((prev) => ({
                      ...prev,
                      desiredOperatorTags: items.map((item) => item.label),
                    }))
                  }
                  placeholder="Match operators by tag (leave empty to match any)"
                  searchSource={tagSearchSource}
                  value={state.desiredOperatorTags.map((tag) => ({
                    id: tag,
                    label: tag,
                  }))}
                />
                {resolvedTemplate ? (
                  <DeployWorkloadFields
                    key={entryKey(resolvedTemplate)}
                    onValidityChange={handleValidityChange}
                    ref={fieldsRef}
                    template={resolvedTemplate}
                  />
                ) : (
                  <Text color="secondary">Loading template…</Text>
                )}
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
                    label={isResolving ? "Loading template…" : "Next"}
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

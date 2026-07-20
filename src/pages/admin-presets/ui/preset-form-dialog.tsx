import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Section } from "@astryxdesign/core/Section";
import { SelectorOption } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Suspense, use, useEffect, useMemo, useState } from "react";

import type { CatalogTemplate } from "@/entities/catalog-parameter";
import {
  ParameterFormFields,
  useParameterFormOptions,
} from "@/entities/catalog-parameter";
import { m } from "@/paraglide/messages";
import { useAppForm } from "@/shared/lib/form/form";
import { getErrorMessage } from "@/shared/lib/get-error-message";
import type { MergedCatalogEntry } from "@/widgets/new-workload-dialog";
import { entryKey, TemplatePicker } from "@/widgets/new-workload-dialog";

import type { PresetFormMode, PresetFormState } from "../model/types";
import { PresetThumbnailPicker } from "./preset-thumbnail-picker";

const MOBILE_QUERY = "(max-width: 640px)";

interface PresetInitial {
  desiredOperatorTags: string[];
  displayName: string;
  groupIds: Id<"groups">[];
  params: Record<string, unknown>;
  templateId: string;
  templateVersion: string;
  thumbnailFileId: Id<"files"> | undefined;
}

const emptyOuterState = (): PresetFormState => ({
  desiredOperatorTags: [],
  displayName: "",
  groupIds: [],
  thumbnailFileId: undefined,
});

// Owns its own useAppForm (built directly on entities/catalog-parameter's
// useParameterFormOptions/ParameterFormFields, same composition as
// workload-redeploy-dialog.tsx) rather than reusing new-workload-dialog's
// DeployWorkloadFields — that component's imperative-ref shape has no way to
// seed prefilled values, which editing a preset's saved params needs.
const PresetParameterForm = ({
  canSave,
  initialParams,
  onSave,
  template,
}: {
  canSave: boolean;
  initialParams: Record<string, unknown> | undefined;
  onSave: (params: Record<string, unknown>) => Promise<void>;
  template: CatalogTemplate;
}) => {
  const options = useParameterFormOptions(template.parameters, initialParams);
  const form = useAppForm({
    ...options,
    onSubmit: async ({ value }) => {
      await onSave(value);
    },
  });

  return (
    <VStack gap={3}>
      <ParameterFormFields form={form} parameters={template.parameters} />
      <form.Subscribe
        selector={(state) => [state.isValid, state.isSubmitting] as const}
      >
        {([isValid, isSubmitting]) => (
          <Button
            isDisabled={!canSave || !isValid || isSubmitting}
            label={isSubmitting ? m.saving() : m.save()}
            onClick={() => form.handleSubmit()}
            style={{ width: "100%" }}
            variant="primary"
          />
        )}
      </form.Subscribe>
    </VStack>
  );
};

// Suspends on `promise` until the template resolves — same pattern as
// new-workload-dialog.tsx's ResolvedTemplateFields, reused here since a
// preset's pinned template can equally have drifted out of the live catalog
// between save and re-open.
const ResolvedParamSection = ({
  canSave,
  initialParams,
  onSave,
  promise,
}: {
  canSave: boolean;
  initialParams: Record<string, unknown> | undefined;
  onSave: (params: Record<string, unknown>) => Promise<void>;
  promise: Promise<CatalogTemplate | null>;
}) => {
  const template = use(promise);
  if (!template) {
    return (
      <Text weight="medium">{m.admin_presets_template_unavailable()}</Text>
    );
  }
  return (
    <PresetParameterForm
      canSave={canSave}
      initialParams={initialParams}
      key={entryKey(template)}
      onSave={onSave}
      template={template}
    />
  );
};

const PresetFormBody = ({
  initial,
  mode,
  onClose,
}: {
  initial: PresetInitial | null;
  mode: PresetFormMode;
  onClose: () => void;
}) => {
  const [outer, setOuter] = useState<PresetFormState>(() =>
    initial
      ? {
          desiredOperatorTags: initial.desiredOperatorTags,
          displayName: initial.displayName,
          groupIds: initial.groupIds,
          thumbnailFileId: initial.thumbnailFileId,
        }
      : emptyOuterState()
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const catalog = useQuery(api.operators.queries.listMergedCatalog);
  const allTags = useQuery(api.operators.queries.listAllTags);
  const allGroups = useQuery(api.groups.queries.listGroups);
  const groupOptions = useMemo(
    () =>
      (allGroups ?? []).map((group) => ({
        badgeColor: group.badgeColor,
        label: group.name,
        value: group._id,
      })),
    [allGroups]
  );

  const [selectedEntry, setSelectedEntry] = useState<MergedCatalogEntry | null>(
    null
  );

  // Pre-selects the currently-pinned entry once the live catalog loads —
  // can't be a lazy useState initializer since `catalog` is still undefined
  // on the very first render. If the pinned templateVersion has since
  // drifted out of the live catalog, this simply never finds a match and
  // selectedEntry stays null, forcing the admin to re-pin a live version —
  // itself a legitimate version-bump edit, not a special case to handle.
  useEffect(() => {
    if (initial && !selectedEntry && catalog) {
      const match = catalog.find(
        (entry) =>
          entry.id === initial.templateId &&
          entry.version === initial.templateVersion
      );
      if (match) {
        // oxlint-disable-next-line react/react-compiler -- pre-selects the currently-pinned catalog entry once the live catalog query resolves; a genuine external-data sync (mirrors use-admin-users.ts's fetch-on-mount pattern), not a render-cascade risk since it only fires once selectedEntry is still unset.
        setSelectedEntry(match);
      }
    }
    // Only re-runs when the catalog itself changes — intentionally excludes
    // selectedEntry so a user's own later reselection is never overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, catalog]);

  const resolveMergedTemplate = useAction(
    api.operators.actions.resolveMergedTemplate
  );
  // Kicked off the moment a template is picked (mirrors
  // new-workload-dialog.tsx's own templatePromise) — memoized on
  // selectedEntry so the same promise instance survives re-renders; use()
  // re-suspends only when it actually receives a new promise.
  const templatePromise = useMemo(() => {
    if (!selectedEntry) {
      return null;
    }
    return resolveMergedTemplate({
      templateId: selectedEntry.id,
      templateVersion: selectedEntry.version,
    });
  }, [selectedEntry, resolveMergedTemplate]);

  const createPreset = useMutation(api.presets.mutations.createPreset);
  const updatePreset = useMutation(api.presets.mutations.updatePreset);

  const handleSave = async (params: Record<string, unknown>) => {
    if (!selectedEntry) {
      return;
    }
    setSaveError(null);
    const fields = {
      desiredOperatorTags: outer.desiredOperatorTags,
      displayName: outer.displayName.trim(),
      groupIds: outer.groupIds,
      params,
      templateId: selectedEntry.id,
      templateVersion: selectedEntry.version,
      thumbnailFileId: outer.thumbnailFileId,
    };
    try {
      await (mode.kind === "create"
        ? createPreset(fields)
        : updatePreset({ ...fields, presetId: mode.presetId }));
      onClose();
    } catch (caughtError) {
      setSaveError(getErrorMessage(caughtError));
    }
  };

  const canSave = Boolean(outer.displayName.trim());

  const listSection = (
    <TemplatePicker
      onSelect={setSelectedEntry}
      selectedKey={selectedEntry ? entryKey(selectedEntry) : null}
    />
  );

  const formSection = selectedEntry ? (
    <VStack gap={3}>
      <TextInput
        isRequired
        label={m.admin_presets_displayname_label()}
        onChange={(displayName) =>
          setOuter((prev) => ({ ...prev, displayName }))
        }
        value={outer.displayName}
      />
      <PresetThumbnailPicker
        onChange={(thumbnailFileId) =>
          setOuter((prev) => ({ ...prev, thumbnailFileId }))
        }
        value={outer.thumbnailFileId}
      />
      <MultiSelector
        hasSearch
        label={m.admin_presets_groups_label()}
        onChange={(value) =>
          setOuter((prev) => ({
            ...prev,
            groupIds: value as Id<"groups">[],
          }))
        }
        options={groupOptions}
        placeholder={m.admin_presets_groups_placeholder()}
        renderOption={(option) => {
          const groupOption = option as (typeof groupOptions)[number];
          return (
            <SelectorOption
              icon={
                <span
                  style={{
                    backgroundColor: `var(--color-icon-${groupOption.badgeColor})`,
                    borderRadius: "50%",
                    display: "inline-block",
                    height: 10,
                    width: 10,
                  }}
                />
              }
              label={groupOption.label}
            />
          );
        }}
        triggerDisplay="badges"
        value={outer.groupIds}
      />
      <MultiSelector
        hasSearch
        label={m.admin_presets_tags_label()}
        onChange={(desiredOperatorTags) =>
          setOuter((prev) => ({ ...prev, desiredOperatorTags }))
        }
        options={allTags ?? []}
        placeholder={m.admin_presets_tags_placeholder()}
        triggerDisplay="labels"
        value={outer.desiredOperatorTags}
      />
      {templatePromise ? (
        <Suspense
          fallback={<Text color="secondary">{m.admin_presets_loading()}</Text>}
        >
          <ResolvedParamSection
            canSave={canSave}
            initialParams={initial?.params}
            onSave={handleSave}
            promise={templatePromise}
          />
        </Suspense>
      ) : null}
      {saveError ? <Text weight="medium">{saveError}</Text> : null}
    </VStack>
  ) : (
    <EmptyState
      description={m.admin_presets_select_template_description()}
      isCompact
      title={m.admin_presets_select_template_title()}
    />
  );

  return (
    <Section height="100%" variant="transparent">
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
          <DialogHeader
            onOpenChange={onClose}
            title={
              mode.kind === "create"
                ? m.admin_presets_create_title()
                : m.admin_presets_edit_title()
            }
          />
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
    </Section>
  );
};

const PresetFormContent = ({
  mode,
  onClose,
}: {
  mode: PresetFormMode;
  onClose: () => void;
}) => {
  const existingPreset = useQuery(
    api.presets.queries.getPreset,
    mode.kind === "edit" ? { presetId: mode.presetId } : "skip"
  );

  useEffect(() => {
    if (mode.kind === "edit" && existingPreset === null) {
      // oxlint-disable-next-line react/react-compiler -- closes the dialog when its target preset was deleted out from under it (e.g. by another admin) — a genuine external-state sync, not a render-cascade risk: existingPreset only ever transitions to null once per mount.
      onClose();
    }
  }, [mode, existingPreset, onClose]);

  if (mode.kind === "edit" && existingPreset === undefined) {
    return (
      <>
        <DialogHeader
          onOpenChange={onClose}
          title={m.admin_presets_edit_title()}
        />
        <Center axis="both" style={{ minHeight: 240 }}>
          <Text color="secondary">{m.admin_presets_loading()}</Text>
        </Center>
      </>
    );
  }

  if (mode.kind === "edit" && !existingPreset) {
    return null;
  }

  return (
    <PresetFormBody
      initial={
        mode.kind === "edit" && existingPreset
          ? {
              desiredOperatorTags: existingPreset.desiredOperatorTags,
              displayName: existingPreset.displayName,
              groupIds: existingPreset.groupIds,
              params: existingPreset.params as Record<string, unknown>,
              templateId: existingPreset.templateId,
              templateVersion: existingPreset.templateVersion,
              thumbnailFileId: existingPreset.thumbnailFileId,
            }
          : null
      }
      mode={mode}
      onClose={onClose}
    />
  );
};

export const PresetFormDialog = ({
  mode,
  onClose,
}: {
  mode: PresetFormMode | null;
  onClose: () => void;
}) => (
  <Dialog
    isOpen={Boolean(mode)}
    maxHeight="90vh"
    onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}
    purpose="form"
    width={960}
  >
    {mode ? (
      <PresetFormContent
        key={mode.kind === "edit" ? mode.presetId : "create"}
        mode={mode}
        onClose={onClose}
      />
    ) : null}
  </Dialog>
);

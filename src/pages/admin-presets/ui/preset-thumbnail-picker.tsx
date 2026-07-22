import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { useUploadFile } from "@convex-dev/r2/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/shared/lib/get-error-message";

// Must match convex/files/mutations.ts#PRESET_THUMBNAILS_GROUP exactly —
// the shared, cross-admin thumbnail library the picker dialog below both
// reads from (existing) and writes to (upload).
const PRESET_THUMBNAILS_GROUP = "preset_thumbnails";

// One surface for both "upload a new image" and "reuse one any admin has
// already uploaded" — replaces an earlier version of this component that
// forced a persistent Upload-new/Select-existing mode toggle regardless of
// whether a thumbnail was already set. Opened from a single "Add"/"Change"
// trigger (see PresetThumbnailPicker below), so there's exactly one entry
// point instead of two competing ones.
const ThumbnailPickerDialog = ({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (fileId: Id<"files">) => void;
}) => {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingThumbnails = useQuery(api.files.queries.listFilesByGroup, {
    group: PRESET_THUMBNAILS_GROUP,
  });
  const uploadFile = useUploadFile(api.storage.r2Client);
  const recordUploadedThumbnail = useMutation(
    api.files.mutations.recordUploadedThumbnail
  );

  const handleUpload = async (file: File | File[] | null) => {
    if (!file || Array.isArray(file)) {
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const key = await uploadFile(file);
      const fileId = await recordUploadedThumbnail({ key, label: file.name });
      setPendingFile(null);
      onSelect(fileId);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      purpose="form"
      width={480}
    >
      <Layout
        content={
          <LayoutContent>
            <VStack gap={4}>
              <FileInput
                accept="image/*"
                changeAction={handleUpload}
                description={m.admin_presets_thumbnail_upload_description()}
                isDisabled={isUploading}
                isLoading={isUploading}
                label={m.admin_presets_thumbnail_upload_tab()}
                mode="dropzone"
                onChange={(next) =>
                  setPendingFile(Array.isArray(next) ? null : next)
                }
                value={pendingFile}
              />
              {error ? <Text weight="medium">{error}</Text> : null}

              {existingThumbnails === undefined ||
              existingThumbnails.length > 0 ? (
                <>
                  <Divider label={m.admin_presets_thumbnail_or()} />
                  <VStack gap={2}>
                    <Text color="secondary" type="supporting">
                      {m.admin_presets_thumbnail_select_tab()}
                    </Text>
                    <HStack gap={2} wrap="wrap">
                      {(existingThumbnails ?? []).map((thumbnail) => (
                        <SelectableCard
                          isSelected={false}
                          key={thumbnail._id}
                          label={thumbnail.label}
                          onChange={() => onSelect(thumbnail._id)}
                        >
                          <Thumbnail
                            alt=""
                            label={thumbnail.label}
                            src={thumbnail.thumbnailUrl}
                          />
                        </SelectableCard>
                      ))}
                    </HStack>
                  </VStack>
                </>
              ) : null}
            </VStack>
          </LayoutContent>
        }
        header={
          <DialogHeader
            onOpenChange={onClose}
            title={m.admin_presets_thumbnail_dialog_title()}
          />
        }
      />
    </Dialog>
  );
};

// Optional single-image field: shows the current thumbnail only once one
// is actually set (no empty placeholder box otherwise), with a single
// "Add"/"Change" trigger opening ThumbnailPickerDialog above for both
// uploading a new image and reusing one already uploaded by any admin —
// this app's first client-driven upload flow (see convex/storage/r2Client.ts).
export const PresetThumbnailPicker = ({
  onChange,
  value,
}: {
  onChange: (fileId?: Id<"files">) => void;
  value: Id<"files"> | undefined;
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const existingThumbnails = useQuery(api.files.queries.listFilesByGroup, {
    group: PRESET_THUMBNAILS_GROUP,
  });
  const selected = (existingThumbnails ?? []).find(
    (thumbnail) => thumbnail._id === value
  );

  return (
    <VStack gap={2}>
      <Text weight="medium">{m.admin_presets_thumbnail_label()}</Text>
      <HStack gap={3} vAlign="center">
        {selected ? (
          <Thumbnail
            alt=""
            label={selected.label}
            onRemove={() => onChange()}
            src={selected.thumbnailUrl}
          />
        ) : null}
        <Button
          label={
            selected
              ? m.admin_presets_thumbnail_change()
              : m.admin_presets_thumbnail_add()
          }
          onClick={() => setIsPickerOpen(true)}
          variant="secondary"
        />
      </HStack>

      <ThumbnailPickerDialog
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(fileId) => {
          onChange(fileId);
          setIsPickerOpen(false);
        }}
      />
    </VStack>
  );
};

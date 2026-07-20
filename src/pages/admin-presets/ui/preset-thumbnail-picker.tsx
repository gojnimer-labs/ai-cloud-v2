import { FileInput } from "@astryxdesign/core/FileInput";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
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
// the shared, cross-admin thumbnail library both tabs below read from
// (existing) and write to (upload).
const PRESET_THUMBNAILS_GROUP = "preset_thumbnails";

// The "select existing" tab's content — its own component (rather than an
// inline branch) so the upload/existing choice below is a single ternary,
// not a nested one.
const ExistingThumbnailsTab = ({
  onChange,
  thumbnails,
  value,
}: {
  onChange: (fileId?: Id<"files">) => void;
  thumbnails: { _id: Id<"files">; label: string; thumbnailUrl: string }[];
  value: Id<"files"> | undefined;
}) =>
  thumbnails.length === 0 ? (
    <Text color="secondary">{m.admin_presets_thumbnail_no_existing()}</Text>
  ) : (
    <HStack gap={2} wrap="wrap">
      {thumbnails.map((thumbnail) => (
        <SelectableCard
          isSelected={thumbnail._id === value}
          key={thumbnail._id}
          label={thumbnail.label}
          onChange={(isSelected) =>
            onChange(isSelected ? thumbnail._id : undefined)
          }
        >
          <Thumbnail
            alt=""
            label={thumbnail.label}
            src={thumbnail.thumbnailUrl}
          />
        </SelectableCard>
      ))}
    </HStack>
  );

// Optional single-image picker, two tabs: upload a new file straight to R2
// (via useUploadFile, this app's first client-driven upload flow — see
// convex/storage/r2Client.ts) or pick one already uploaded by any admin.
// Both tabs resolve to the same thing: a Id<"files"> the preset's
// thumbnailFileId field stores, or undefined for "no thumbnail".
export const PresetThumbnailPicker = ({
  onChange,
  value,
}: {
  onChange: (fileId?: Id<"files">) => void;
  value: Id<"files"> | undefined;
}) => {
  const [mode, setMode] = useState<"existing" | "upload">("upload");
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

  const selected = (existingThumbnails ?? []).find(
    (thumbnail) => thumbnail._id === value
  );

  const handleUpload = async (file: File | File[] | null) => {
    if (!file || Array.isArray(file)) {
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const key = await uploadFile(file);
      const fileId = await recordUploadedThumbnail({
        key,
        label: file.name,
      });
      onChange(fileId);
      setPendingFile(null);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <VStack gap={3}>
      <SegmentedControl
        label={m.admin_presets_thumbnail_label()}
        onChange={(next) => setMode(next as "existing" | "upload")}
        value={mode}
      >
        <SegmentedControlItem
          label={m.admin_presets_thumbnail_upload_tab()}
          value="upload"
        />
        <SegmentedControlItem
          label={m.admin_presets_thumbnail_select_tab()}
          value="existing"
        />
      </SegmentedControl>

      <HStack gap={3} vAlign="center">
        <Thumbnail
          alt=""
          isLoading={isUploading}
          label={selected?.label ?? m.admin_presets_thumbnail_none()}
          onRemove={value ? () => onChange() : undefined}
          src={selected?.thumbnailUrl}
        />
        {mode === "upload" ? (
          <FileInput
            accept="image/*"
            changeAction={handleUpload}
            isDisabled={isUploading}
            isLabelHidden
            isLoading={isUploading}
            isOptional
            label={m.admin_presets_thumbnail_upload_tab()}
            onChange={(next) =>
              setPendingFile(Array.isArray(next) ? null : next)
            }
            value={pendingFile}
          />
        ) : (
          <ExistingThumbnailsTab
            onChange={onChange}
            thumbnails={existingThumbnails ?? []}
            value={value}
          />
        )}
      </HStack>
      {error ? <Text weight="medium">{error}</Text> : null}
    </VStack>
  );
};

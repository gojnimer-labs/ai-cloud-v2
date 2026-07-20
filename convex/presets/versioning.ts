// Pure snapshot-equivalence check, no Convex function of its own — covered
// by presets-mutations.test.ts's updatePresetInternal tests rather than
// needing a dedicated test file (same convention as operators/tagMatch.ts/
// catalogMatch.ts).
//
// Object-valued params compare equal regardless of key order (a re-saved
// form with the same values in a different key order shouldn't spuriously
// bump the version), which JSON.stringify alone doesn't give you — its
// output preserves insertion order.
const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val).toSorted(([a], [b]) => a.localeCompare(b))
        )
      : val
  );

export interface PresetSnapshotShape {
  params: unknown;
  templateId: string;
  templateVersion: string;
}

// True when two snapshots describe the same deployable shape — the gate
// presets/mutations.ts#updatePresetInternal uses to decide whether an edit
// bumps the preset's version or is metadata-only (displayName/thumbnail/
// groups/desiredOperatorTags never reach this check at all).
export const isSnapshotEquivalent = (
  a: PresetSnapshotShape,
  b: PresetSnapshotShape
): boolean =>
  a.templateId === b.templateId &&
  a.templateVersion === b.templateVersion &&
  stableStringify(a.params) === stableStringify(b.params);

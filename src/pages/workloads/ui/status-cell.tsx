import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";

import type { WorkloadLivePhase, WorkloadRow } from "../model/types";
import { PhaseCell } from "./phase-cell";

interface StatusMeta {
  isPulsing?: boolean;
  label: string;
  variant: "success" | "warning" | "error" | "accent" | "neutral";
}

// One entry per convex/schema.ts#workloadStatusValidator literal — keeping this a
// Record over the full union (rather than an if/else chain) means adding a new
// status literal to the backend is a compile error here, not a silent fallback.
const STATUS_META: Record<WorkloadRow["status"], StatusMeta> = {
  active: { label: "Active", variant: "success" },
  destroyed: { label: "Destroyed", variant: "neutral" },
  destroying: { isPulsing: true, label: "Destroying", variant: "warning" },
  failed: { label: "Failed", variant: "error" },
  orphaned: { label: "Orphaned", variant: "neutral" },
  provisioning: { isPulsing: true, label: "Provisioning", variant: "accent" },
  redeploying: { isPulsing: true, label: "Redeploying", variant: "accent" },
  requested: { label: "Requested", variant: "neutral" },
  requested_destroy: { label: "Destroy requested", variant: "warning" },
  requested_redeploy: { label: "Redeploy requested", variant: "warning" },
  requested_resume: { label: "Resume requested", variant: "warning" },
  requested_stop: { label: "Stop requested", variant: "warning" },
  resuming: { isPulsing: true, label: "Resuming", variant: "accent" },
  stopped: { label: "Stopped", variant: "neutral" },
  stopping: { isPulsing: true, label: "Stopping", variant: "warning" },
};

// Request-lifecycle status (workloads.status) — a distinct concern from the CR's
// own live runtime phase (see phase-cell.tsx), which only ever applies to an
// `active` row and is nested alongside it here when the poll has one.
//
// An `active` OR `stopped` row that carries a `failureReason` (see convex/
// workloads/mutations.ts#reportLifecycle) went through a rocky redeploy/create/
// resume attempt that didn't take — the CR is still in whatever state it was
// already in, so the row is genuinely active/stopped, but that history is
// surfaced as a warning-colored dot with the reason on hover rather than
// silently dropped.
export const StatusCell = ({
  livePhase,
  row,
}: {
  livePhase?: WorkloadLivePhase;
  row: WorkloadRow;
}) => {
  const meta = STATUS_META[row.status];
  const isRecovered =
    (row.status === "active" || row.status === "stopped") &&
    Boolean(row.failureReason);
  const tooltip =
    row.status === "failed" || isRecovered ? row.failureReason : undefined;

  return (
    <HStack gap={2} vAlign="center">
      <StatusDot
        isPulsing={meta.isPulsing}
        label={meta.label}
        tooltip={tooltip}
        variant={isRecovered ? "warning" : meta.variant}
      />
      {/* StatusDot's `label` is aria-only (screen readers) — it renders no
          visible text on its own, so the status still needs an explicit,
          visible label here. */}
      <Text color="secondary">{meta.label}</Text>
      {row.status === "active" && livePhase ? (
        <PhaseCell phase={livePhase.phase} />
      ) : null}
    </HStack>
  );
};

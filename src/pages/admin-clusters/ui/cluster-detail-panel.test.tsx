import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import type { ResourceCapacity } from "../model/types";
import { ResourceUsageSection } from "./cluster-detail-panel";

// Byte values are exact GiB multiples (formatByteUsage renders GB with one
// decimal place, e.g. 2 GiB -> "2.0 GB") so the expected rendered text below
// is exact, not an approximation.
const GIB = 1024 ** 3;

const baseCapacity = {
  allocatableMemoryBytes: 4 * GIB,
  allocatableMilliCpu: 4000,
  reportedAt: 0,
  usedMemoryBytes: 3 * GIB,
  usedMilliCpu: 3000,
} satisfies ResourceCapacity;

// The actual bug this guards against: the "Managed workloads" bars were
// wired to usedMilliCpu/usedMemoryBytes (requests) instead of
// managedUsedMilliCpu/managedUsedMemoryBytes (live) — every existing
// type/lint/unit check passed with that swap in place, since it's an
// intent mismatch (wrong field reaching the right bar), not a type error.
// This renders the actual component and asserts on the visible numbers.
test("managed group renders live managedUsed*, not requests-based used*", async () => {
  const resourceCapacity: ResourceCapacity = {
    ...baseCapacity,
    clusterUsedMemoryBytes: 2 * GIB,
    clusterUsedMilliCpu: 2500,
    managedUsedMemoryBytes: GIB / 2,
    managedUsedMilliCpu: 900,
  };

  const screen = await render(
    <ResourceUsageSection resourceCapacity={resourceCapacity} />
  );

  // Cluster group: live cluster-wide numbers.
  await expect.element(screen.getByText("2.5 / 4 cores")).toBeInTheDocument();
  await expect.element(screen.getByText("2.0 / 4.0 GB")).toBeInTheDocument();
  // Managed group: live managed numbers — NOT the requests-based
  // usedMilliCpu=3000/usedMemoryBytes=3*GIB on baseCapacity.
  await expect.element(screen.getByText("0.9 / 4 cores")).toBeInTheDocument();
  await expect.element(screen.getByText("0.5 / 4.0 GB")).toBeInTheDocument();
  await expect.element(screen.getByText("3 / 4 cores")).not.toBeInTheDocument();
});

test("falls back to requests-based used* when no live reading exists yet", async () => {
  const screen = await render(
    <ResourceUsageSection resourceCapacity={baseCapacity} />
  );

  await expect.element(screen.getByText("3 / 4 cores")).toBeInTheDocument();
  await expect.element(screen.getByText("3.0 / 4.0 GB")).toBeInTheDocument();
});

test("shows the no-data message when resourceCapacity is absent", async () => {
  const screen = await render(
    <ResourceUsageSection resourceCapacity={undefined} />
  );

  await expect
    .element(screen.getByText("No resource data reported yet."))
    .toBeInTheDocument();
});

test("shows a partial-node note only when nodesReporting is below nodesTotal", async () => {
  const resourceCapacity: ResourceCapacity = {
    ...baseCapacity,
    clusterUsedMemoryBytes: 2 * GIB,
    clusterUsedMilliCpu: 2500,
    managedUsedMemoryBytes: GIB / 2,
    managedUsedMilliCpu: 900,
    nodesReporting: 4,
    nodesTotal: 5,
  };

  const screen = await render(
    <ResourceUsageSection resourceCapacity={resourceCapacity} />
  );

  await expect
    .element(screen.getByText("Based on 4/5 nodes"))
    .toBeInTheDocument();
});

import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/_authed/workloads")({
  component: WorkloadsPage,
});

const WORKLOAD_POLL_INTERVAL_MS = 4000;
const DEMO_IMAGE = "nginxdemos/hello:latest";
const DEMO_NAMESPACE = "default";
// nginxdemos/hello listens on 80 internally — the operator's containerPort
// defaults to 8080 if unspecified, which would deploy the Service/Deployment
// pointing at a port nothing is actually listening on.
const DEMO_CONTAINER_PORT = 80;

// biome-ignore lint/style/useConsistentTypeDefinitions: must stay a type alias — Table<T> requires T extends Record<string, unknown>, which an interface doesn't structurally satisfy.
type WorkloadRow = {
  _id: Id<"workloads">;
  image: string;
  name: string;
  namespace: string;
  phase: string;
  readyReplicas: number;
};

function formatRelativeTime(ms: number | undefined): string {
  if (!ms) {
    return "never";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function PhaseCell({ phase }: { phase: string }) {
  // Per this design system's Badge guidance: don't badge every row the same
  // — only the states that need attention. Running/Deploying are shown as
  // plain text; Failed/unknown/unreachable get a Badge.
  if (phase === "Running" || phase === "Deploying" || phase === "Pending") {
    return <Text color="secondary">{phase}</Text>;
  }
  return <Badge label={phase} variant="error" />;
}

function WorkloadsPage() {
  const operators = useQuery(api.operators.queries.list);
  const deployWorkload = useAction(api.workloads.actions.deployWorkload);
  const listMyWorkloads = useAction(api.workloads.actions.listMyWorkloads);
  const getWorkloadAccessToken = useAction(
    api.workloads.actions.getWorkloadAccessToken
  );

  const [workloads, setWorkloads] = useState<WorkloadRow[] | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const rows = await listMyWorkloads({});
        if (!cancelled) {
          setWorkloads(rows);
        }
      } catch {
        // Keep showing the last known list on a transient polling failure.
      }
    }

    poll();
    // Deliberate simple client-side polling: listMyWorkloads is an action
    // (it fetches live status from the operator), and Convex actions aren't
    // subscribable the way queries are — this is a conscious POC-simplicity
    // choice, not an oversight.
    const id = setInterval(poll, WORKLOAD_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [listMyWorkloads]);

  async function handleDeployDemo() {
    const firstActiveOperator = operators?.find((o) => o.status === "active");
    if (!firstActiveOperator) {
      return;
    }
    setIsDeploying(true);
    try {
      await deployWorkload({
        containerPort: DEMO_CONTAINER_PORT,
        image: DEMO_IMAGE,
        name: `nginx-demo-${Date.now().toString(36)}`,
        namespace: DEMO_NAMESPACE,
        operatorId: firstActiveOperator._id,
      });
      const rows = await listMyWorkloads({});
      setWorkloads(rows);
    } finally {
      setIsDeploying(false);
    }
  }

  async function handleOpen(workloadId: Id<"workloads">) {
    const { externalUrl, namespace, name, token } =
      await getWorkloadAccessToken({ workloadId });
    window.open(
      `${externalUrl}/gw/${namespace}/${name}/?token=${encodeURIComponent(token)}`,
      "_blank"
    );
  }

  const columns: TableColumn<WorkloadRow>[] = [
    {
      header: "Name",
      key: "name",
      renderCell: (row) => (
        <Text type="body" weight="semibold">
          {row.name}
        </Text>
      ),
    },
    {
      header: "Namespace",
      key: "namespace",
      renderCell: (row) => <Text color="secondary">{row.namespace}</Text>,
    },
    {
      header: "Image",
      key: "image",
      renderCell: (row) => <Text color="secondary">{row.image}</Text>,
    },
    {
      header: "Status",
      key: "phase",
      renderCell: (row) => <PhaseCell phase={row.phase} />,
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: (row) => (
        <Button
          label="Open"
          onClick={() => handleOpen(row._id)}
          size="sm"
          variant="secondary"
        />
      ),
    },
  ];

  return (
    <AppShell contentPadding={6} height="fill">
      <VStack gap={6}>
        <VStack gap={2}>
          <Heading level={1}>Workloads</Heading>
          <Text color="secondary">
            Operators register with Convex and heartbeat on an interval;
            workloads deploy through them and are opened via a
            permission-checked gateway route.
          </Text>
        </VStack>

        <VStack gap={2}>
          <Heading level={2}>Operators</Heading>
          <List density="compact" hasDividers>
            {(operators ?? []).map((operator) => (
              <ListItem
                description={`Last heartbeat: ${formatRelativeTime(operator.lastHeartbeatAt)}`}
                endContent={
                  <StatusDot
                    isPulsing={operator.status === "active"}
                    label={operator.status}
                    variant={operator.status === "active" ? "success" : "error"}
                  />
                }
                key={operator._id}
                label={operator.name}
              />
            ))}
          </List>
        </VStack>

        <VStack gap={2}>
          <HStack hAlign="between" vAlign="center">
            <Heading level={2}>Your workloads</Heading>
            <Button
              isDisabled={
                isDeploying || !operators?.some((o) => o.status === "active")
              }
              label="Deploy nginx demo"
              onClick={handleDeployDemo}
              variant="primary"
            />
          </HStack>
          <Table<WorkloadRow>
            columns={columns}
            data={workloads ?? []}
            hasHover
            idKey="_id"
          />
        </VStack>
      </VStack>
    </AppShell>
  );
}

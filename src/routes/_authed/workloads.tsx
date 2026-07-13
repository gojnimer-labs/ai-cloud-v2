import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
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
const DEFAULT_NAMESPACE = "default";

type ParameterType = "string" | "number" | "boolean" | "select";
type ParameterSource = "user" | "system";

interface CatalogParameter {
  default?: unknown;
  description?: string;
  key: string;
  label: string;
  options?: { label: string; value: string }[];
  required: boolean;
  source: ParameterSource;
  type: ParameterType;
}

interface CatalogTemplate {
  description: string;
  icon: string;
  id: string;
  name: string;
  parameters: CatalogParameter[];
}

// biome-ignore lint/style/useConsistentTypeDefinitions: must stay a type alias — Table<T> requires T extends Record<string, unknown>, which an interface doesn't structurally satisfy.
type WorkloadRow = {
  _id: Id<"workloads">;
  name: string;
  namespace: string;
  phase: string;
  readyReplicas: number;
  templateId: string;
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

// Renders one form field for a catalog parameter, dispatching on its
// declared type. Only ever called for source:"user" parameters — system
// ones (e.g. profileDownloadUrl) are computed server-side and never shown.
function ParamField({
  onChange,
  param,
  value,
}: {
  onChange: (value: unknown) => void;
  param: CatalogParameter;
  value: unknown;
}) {
  if (param.type === "boolean") {
    return (
      <CheckboxInput
        description={param.description}
        label={param.label}
        onChange={(checked) => onChange(checked)}
        value={value === true}
      />
    );
  }
  if (param.type === "number") {
    return (
      <NumberInput
        description={param.description}
        label={param.label}
        onChange={(n) => onChange(n)}
        value={typeof value === "number" ? value : null}
      />
    );
  }
  if (param.type === "select") {
    return (
      <Selector
        description={param.description}
        label={param.label}
        onChange={(v) => onChange(v)}
        options={(param.options ?? []).map((o) => ({
          label: o.label,
          value: o.value,
        }))}
        value={typeof value === "string" ? value : ""}
      />
    );
  }
  return (
    <TextInput
      description={param.description}
      label={param.label}
      onChange={(v) => onChange(v)}
      value={typeof value === "string" ? value : ""}
    />
  );
}

function defaultParamValues(
  template: CatalogTemplate
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const param of template.parameters) {
    if (param.source === "user" && param.default !== undefined) {
      values[param.key] = param.default;
    }
  }
  return values;
}

function WorkloadsPage() {
  const operators = useQuery(api.operators.queries.list);
  const getCatalog = useAction(api.operators.actions.getCatalog);
  const deployWorkload = useAction(api.workloads.actions.deployWorkload);
  const listMyWorkloads = useAction(api.workloads.actions.listMyWorkloads);
  const getWorkloadAccessToken = useAction(
    api.workloads.actions.getWorkloadAccessToken
  );

  const [workloads, setWorkloads] = useState<WorkloadRow[] | null>(null);

  const [operatorId, setOperatorId] = useState<Id<"operators"> | null>(null);
  const [catalog, setCatalog] = useState<CatalogTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});
  const [workloadName, setWorkloadName] = useState("");
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE);
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

  useEffect(() => {
    if (!operatorId) {
      setCatalog(null);
      setTemplateId(null);
      return;
    }
    let cancelled = false;
    getCatalog({ operatorId }).then((templates) => {
      if (!cancelled) {
        setCatalog(templates);
        setTemplateId(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [operatorId, getCatalog]);

  const selectedTemplate = catalog?.find((t) => t.id === templateId) ?? null;

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    const template = catalog?.find((t) => t.id === id);
    setParamValues(template ? defaultParamValues(template) : {});
  }

  async function handleDeploy() {
    if (!(operatorId && templateId && workloadName)) {
      return;
    }
    setIsDeploying(true);
    try {
      await deployWorkload({
        name: workloadName,
        namespace,
        operatorId,
        params: paramValues,
        templateId,
      });
      setWorkloadName("");
      const rows = await listMyWorkloads({});
      setWorkloads(rows);
    } finally {
      setIsDeploying(false);
    }
  }

  async function handleOpen(workloadId: Id<"workloads">) {
    const {
      externalUrl,
      namespace: ns,
      name,
      token,
    } = await getWorkloadAccessToken({
      workloadId,
    });
    window.open(
      `${externalUrl}/gw/${ns}/${name}/?token=${encodeURIComponent(token)}`,
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
      header: "Template",
      key: "templateId",
      renderCell: (row) => <Text color="secondary">{row.templateId}</Text>,
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

  const canDeploy =
    Boolean(operatorId && templateId && workloadName && namespace) &&
    !isDeploying;

  return (
    <AppShell contentPadding={6} height="fill">
      <VStack gap={6}>
        <VStack gap={2}>
          <Heading level={1}>Workloads</Heading>
          <Text color="secondary">
            Operators register with Convex and heartbeat on an interval;
            workloads deploy through them from a catalog they publish, and are
            opened via a permission-checked gateway route.
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

        <Section>
          <VStack gap={4}>
            <Heading level={2}>Deploy a workload</Heading>
            <Selector
              hasClear
              label="Cluster / operator"
              onChange={(v) => setOperatorId(v ? (v as Id<"operators">) : null)}
              options={(operators ?? [])
                .filter((o) => o.status === "active")
                .map((o) => ({ label: o.name, value: o._id }))}
              placeholder="Choose an operator"
              value={operatorId ?? ""}
            />

            {operatorId ? (
              <Selector
                hasClear
                isDisabled={!catalog}
                label="Template"
                onChange={(v) => v && handleSelectTemplate(v)}
                options={(catalog ?? []).map((t) => ({
                  label: `${t.icon} ${t.name}`,
                  value: t.id,
                }))}
                placeholder={catalog ? "Choose a template" : "Loading catalog…"}
                value={templateId ?? ""}
              />
            ) : null}

            {selectedTemplate ? (
              <VStack gap={3}>
                <Text color="secondary">{selectedTemplate.description}</Text>
                <TextInput
                  label="Name"
                  onChange={setWorkloadName}
                  value={workloadName}
                />
                <TextInput
                  label="Namespace"
                  onChange={setNamespace}
                  value={namespace}
                />
                {selectedTemplate.parameters
                  .filter((p) => p.source === "user")
                  .map((param) => (
                    <ParamField
                      key={param.key}
                      onChange={(v) =>
                        setParamValues((prev) => ({ ...prev, [param.key]: v }))
                      }
                      param={param}
                      value={paramValues[param.key]}
                    />
                  ))}
                <HStack>
                  <Button
                    isDisabled={!canDeploy}
                    label={isDeploying ? "Deploying…" : "Deploy"}
                    onClick={handleDeploy}
                    variant="primary"
                  />
                </HStack>
              </VStack>
            ) : null}
          </VStack>
        </Section>

        <VStack gap={2}>
          <Heading level={2}>Your workloads</Heading>
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

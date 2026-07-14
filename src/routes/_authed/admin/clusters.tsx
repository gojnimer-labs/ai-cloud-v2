import { Badge } from "@astryxdesign/core/Badge";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import type { PowerSearchFilter } from "@astryxdesign/core/PowerSearch";
import {
  PowerSearch,
  usePowerSearchConfig,
} from "@astryxdesign/core/PowerSearch";
import { Section } from "@astryxdesign/core/Section";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import type { TableColumn } from "@astryxdesign/core/Table";
import {
  pixel,
  proportional,
  resolveColumnWidths,
  Table,
  TableCell,
  TableRow,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Fragment, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/_authed/admin/clusters")({
  component: ClustersPage,
});

const groupHeaderCell: React.CSSProperties = {
  backgroundColor: "var(--color-background-muted)",
  cursor: "pointer",
  padding: "var(--spacing-3) var(--spacing-4)",
};

const CLUSTER_WORKLOAD_FIELD_DEFS = [
  { key: "clusterName", label: "Cluster", type: "string" },
  { key: "userEmail", label: "User", type: "string" },
  { key: "createdAt", label: "Date", type: "date" },
  { key: "name", label: "Workload", type: "string" },
  { key: "templateId", label: "Template", type: "string" },
] as const;

interface ClusterWorkloadRow extends Record<string, unknown> {
  _id: Id<"workloads">;
  clusterId: Id<"operators">;
  clusterName: string;
  createdAt: number;
  name: string;
  namespace: string;
  templateId: string;
  userEmail: string;
}

const columns: TableColumn<ClusterWorkloadRow>[] = [
  { header: "Workload", key: "name", width: proportional(1) },
  { header: "Template", key: "templateId", width: pixel(140) },
  { header: "Namespace", key: "namespace", width: pixel(140) },
  { header: "User", key: "userEmail", width: pixel(220) },
  { header: "Created", key: "createdAt", width: pixel(120) },
];

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ClustersPage() {
  const clusters = useQuery(api.admin.queries.listClusters);
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
  const [collapsedClusters, setCollapsedClusters] = useState<
    Set<Id<"operators">>
  >(new Set());

  const { config, applyFilters } = usePowerSearchConfig(
    CLUSTER_WORKLOAD_FIELD_DEFS,
    "ClusterWorkloadSearch"
  );

  const rows = useMemo<ClusterWorkloadRow[]>(
    () =>
      (clusters ?? []).flatMap((cluster) =>
        cluster.workloads.map((workload) => ({
          _id: workload._id,
          clusterId: cluster._id,
          clusterName: cluster.name,
          createdAt: workload.createdAt,
          name: workload.name,
          namespace: workload.namespace,
          templateId: workload.templateId,
          userEmail: workload.userEmail,
        }))
      ),
    [clusters]
  );

  const filteredRows = applyFilters(filters, rows);

  const groupedClusters = useMemo(() => {
    const matchedWorkloadIds = new Set(filteredRows.map((row) => row._id));
    const withMatches = (clusters ?? []).map((cluster) => ({
      ...cluster,
      workloads: cluster.workloads.filter((workload) =>
        matchedWorkloadIds.has(workload._id)
      ),
    }));
    // With no active search, show every cluster (including empty ones) so
    // the fleet overview is complete. Once searching, a cluster with no
    // surviving workload rows isn't a useful result — hide it.
    return filters.length === 0
      ? withMatches
      : withMatches.filter((cluster) => cluster.workloads.length > 0);
  }, [clusters, filteredRows, filters.length]);

  const toggleCluster = (clusterId: Id<"operators">) => {
    setCollapsedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  const columnCount = columns.length;
  const resolvedWidths = resolveColumnWidths(columns);

  if (clusters === undefined) {
    return (
      <Center axis="both" style={{ minHeight: "100%" }}>
        <Text type="supporting">Loading clusters…</Text>
      </Center>
    );
  }

  return (
    <Section padding={6} variant="transparent">
      <VStack gap={4}>
        <HStack gap={3} vAlign="center">
          <Heading level={1}>Clusters</Heading>
        </HStack>

        <PowerSearch
          config={config}
          filters={filters}
          onChange={(newFilters) => setFilters([...newFilters])}
          placeholder="Search by cluster, user, date, workload, or template…"
          resultCount={`${filteredRows.length} workload${filteredRows.length === 1 ? "" : "s"}`}
        />

        {groupedClusters.length === 0 ? (
          <EmptyState
            description="No clusters match your search."
            title="No results"
          />
        ) : (
          <Table<ClusterWorkloadRow>
            columns={columns}
            density="balanced"
            dividers="rows"
            hasHover
            textOverflow="truncate"
          >
            <colgroup>
              {columns.map((column) => (
                <col
                  key={column.key}
                  style={resolvedWidths.columns.get(column.key)?.style}
                />
              ))}
            </colgroup>
            {groupedClusters.map((cluster) => {
              const isCollapsed = collapsedClusters.has(cluster._id);
              return (
                <Fragment key={cluster._id}>
                  <TableRow
                    onClick={() => toggleCluster(cluster._id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleCluster(cluster._id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <TableCell colSpan={columnCount} style={groupHeaderCell}>
                      <HStack gap={2} vAlign="center">
                        <Icon
                          color="secondary"
                          icon={
                            isCollapsed ? ChevronRightIcon : ChevronDownIcon
                          }
                          size="sm"
                        />
                        <StatusDot
                          isPulsing={cluster.status === "active"}
                          label={cluster.status}
                          variant={
                            cluster.status === "active" ? "success" : "error"
                          }
                        />
                        <Text type="body" weight="bold">
                          {cluster.name}
                        </Text>
                        <Badge
                          label={String(cluster.workloads.length)}
                          variant="neutral"
                        />
                      </HStack>
                    </TableCell>
                  </TableRow>
                  {isCollapsed
                    ? null
                    : cluster.workloads.map((workload) => (
                        <TableRow key={workload._id}>
                          <TableCell>
                            <Text maxLines={1} type="body">
                              {workload.name}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <Text color="secondary" type="supporting">
                              {workload.templateId}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <Text color="secondary" type="supporting">
                              {workload.namespace}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <Text color="secondary" type="supporting">
                              {workload.userEmail}
                            </Text>
                          </TableCell>
                          <TableCell>
                            <Text color="secondary" type="supporting">
                              {formatDate(workload.createdAt)}
                            </Text>
                          </TableCell>
                        </TableRow>
                      ))}
                  {isCollapsed || cluster.workloads.length > 0 ? null : (
                    <TableRow>
                      <TableCell colSpan={columnCount}>
                        <Text color="secondary" type="supporting">
                          No workloads on this cluster.
                        </Text>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </Table>
        )}
      </VStack>
    </Section>
  );
}

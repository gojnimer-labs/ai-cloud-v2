import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { getRouteApi } from "@tanstack/react-router";

import { m } from "@/paraglide/messages";

import { formatMetricLabel } from "../model/format";
import { TIME_RANGE_OPTIONS } from "../model/time-range";
import type { TimeRangeValue } from "../model/time-range";
import type {
  DashboardView,
  TimelinePoint,
  WorkloadMetricRow,
} from "../model/types";
import { useWorkloadMetricsDashboard } from "../model/use-workload-metrics-dashboard";
import { ByUserView } from "./by-user-view";
import { ByWorkloadView } from "./by-workload-view";
import { OverviewView } from "./overview-view";

const routeApi = getRouteApi("/_authed/admin/workload-metrics");

const DashboardBody = ({
  bucketMs,
  endTime,
  metric,
  startTime,
  summary,
  timeline,
  view,
}: {
  bucketMs: number;
  endTime: number;
  metric: string;
  startTime: number;
  summary: WorkloadMetricRow[] | undefined;
  timeline: TimelinePoint[] | undefined;
  view: DashboardView;
}) => {
  if (summary === undefined || timeline === undefined) {
    return (
      <Center axis="both" minHeight={240}>
        <Text type="supporting">{m.loading()}</Text>
      </Center>
    );
  }
  if (view === "by-user") {
    return <ByUserView rows={summary} />;
  }
  if (view === "by-workload") {
    return (
      <ByWorkloadView
        bucketMs={bucketMs}
        endTime={endTime}
        metric={metric}
        rows={summary}
        startTime={startTime}
      />
    );
  }
  return (
    <OverviewView
      bucketMs={bucketMs}
      metric={metric}
      rows={summary}
      timeline={timeline}
    />
  );
};

export const WorkloadMetricsDashboardPage = () => {
  const { view } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  const {
    endTime,
    metricNames,
    range,
    rangeValue,
    refresh,
    selectedMetric,
    setMetric,
    setRangeValue,
    startTime,
    summary,
    timeline,
  } = useWorkloadMetricsDashboard();

  const setView = (next: DashboardView) => {
    navigate({ search: (prev) => ({ ...prev, view: next }) });
  };

  if (metricNames === undefined) {
    return (
      <Center axis="both" minHeight="100%">
        <Text type="supporting">{m.loading()}</Text>
      </Center>
    );
  }

  return (
    <Section height="100%" padding={6} variant="transparent">
      <Layout
        content={
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- LayoutContent is an astryx component, not a real HTML element; it renders its own markup and doesn't accept swapping in a literal <main> tag.
          <LayoutContent padding={3} role="main">
            {metricNames.length === 0 ? (
              <Center axis="both" minHeight={240}>
                <EmptyState
                  description={m.admin_workload_metrics_no_metrics_description()}
                  title={m.admin_workload_metrics_no_metrics_title()}
                />
              </Center>
            ) : (
              <VStack gap={6}>
                <HStack gap={4} vAlign="end" wrap="wrap">
                  <StackItem>
                    <Selector
                      isLabelHidden
                      label={m.admin_workload_metrics_metric_label()}
                      onChange={setMetric}
                      options={metricNames.map((name) => ({
                        label: formatMetricLabel(name),
                        value: name,
                      }))}
                      value={selectedMetric ?? undefined}
                    />
                  </StackItem>
                  <SegmentedControl
                    label={m.admin_workload_metrics_range_label()}
                    onChange={(value) => setRangeValue(value as TimeRangeValue)}
                    value={rangeValue}
                  >
                    {TIME_RANGE_OPTIONS.map((option) => (
                      <SegmentedControlItem
                        key={option.value}
                        label={option.label}
                        value={option.value}
                      />
                    ))}
                  </SegmentedControl>
                </HStack>

                <TabList
                  onChange={(value) => setView(value as DashboardView)}
                  value={view}
                >
                  <Tab
                    label={m.admin_workload_metrics_tab_overview()}
                    value="overview"
                  />
                  <Tab
                    label={m.admin_workload_metrics_tab_by_user()}
                    value="by-user"
                  />
                  <Tab
                    label={m.admin_workload_metrics_tab_by_workload()}
                    value="by-workload"
                  />
                </TabList>

                <DashboardBody
                  bucketMs={range.bucketMs}
                  endTime={endTime}
                  metric={selectedMetric ?? ""}
                  startTime={startTime}
                  summary={summary}
                  timeline={timeline}
                  view={view}
                />
              </VStack>
            )}
          </LayoutContent>
        }
        header={
          <LayoutHeader hasDivider padding={4}>
            <HStack gap={3} vAlign="center">
              <StackItem size="fill">
                <VStack gap={2}>
                  <Heading level={1}>{m.nav_workload_metrics()}</Heading>
                  <Text color="secondary">
                    {m.admin_workload_metrics_page_subtitle()}
                  </Text>
                </VStack>
              </StackItem>
              <Button
                icon={<Icon icon={ArrowPathIcon} size="sm" />}
                label={m.admin_workload_metrics_refresh()}
                onClick={refresh}
                variant="secondary"
              />
            </HStack>
          </LayoutHeader>
        }
        height="fill"
      />
    </Section>
  );
};

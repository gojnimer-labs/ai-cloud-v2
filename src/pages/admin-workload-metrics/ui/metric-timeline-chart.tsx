import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useTheme } from "@astryxdesign/core/theme";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { m } from "@/paraglide/messages";

import {
  formatBucketLabel,
  formatDateTime,
  formatSiNumber,
} from "../model/format";
import type { TimelinePoint } from "../model/types";

// Trend-over-time is a single series here (total increase across every
// filtered workload) — per the dataviz form guide that's sequential, one
// hue, not the categorical palette; astryx's own "blue" hue token stands in
// for the sequential ramp.
const TimelineTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TimelinePoint }[];
}) => {
  if (!(active && payload?.length)) {
    return null;
  }
  const point = payload[0].payload;
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text color="secondary" type="supporting">
          {formatDateTime(point.bucketStart)}
        </Text>
        <Text type="body" weight="bold">
          {formatSiNumber(point.value)}
        </Text>
      </VStack>
    </Card>
  );
};

export const MetricTimelineChart = ({
  bucketMs,
  points,
  title,
}: {
  bucketMs: number;
  points: TimelinePoint[];
  title: string;
}) => {
  const { token } = useTheme();
  const stroke = token("--color-icon-blue");
  const fill = token("--color-background-blue");
  const grid = token("--color-border");
  const axisText = token("--color-text-secondary");

  return (
    <Card>
      <VStack gap={4}>
        <Heading level={4}>{title}</Heading>
        {points.length === 0 ? (
          <Center axis="both" minHeight={240}>
            <Text color="secondary" type="supporting">
              {m.admin_workload_metrics_no_data()}
            </Text>
          </Center>
        ) : (
          <ResponsiveContainer height={280} width="100%">
            <AreaChart
              data={points}
              margin={{ bottom: 5, left: 0, right: 10, top: 5 }}
            >
              <CartesianGrid horizontal stroke={grid} vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="bucketStart"
                tick={{ fill: axisText, fontSize: 12 }}
                tickFormatter={(value: number) =>
                  formatBucketLabel(value, bucketMs)
                }
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                tick={{ fill: axisText, fontSize: 12 }}
                tickFormatter={(value: number) => formatSiNumber(value)}
                tickLine={false}
                width={48}
              />
              <Tooltip
                content={<TimelineTooltip />}
                cursor={{ stroke: grid }}
              />
              <Area
                dataKey="value"
                fill={fill}
                fillOpacity={1}
                stroke={stroke}
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </VStack>
    </Card>
  );
};

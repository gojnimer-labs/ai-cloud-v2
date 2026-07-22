import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useTheme } from "@astryxdesign/core/theme";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { m } from "@/paraglide/messages";

import { formatSiNumber } from "../model/format";

export interface MetricBarDatum {
  label: string;
  value: number;
}

// Magnitude comparison across entities (users, workloads) — per the dataviz
// form guide this is a bar chart identified by axis label, sequential one
// hue, not a categorical palette (there's no "identity" job here, only
// "which is bigger").
const BarTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetricBarDatum }[];
}) => {
  if (!(active && payload?.length)) {
    return null;
  }
  const point = payload[0].payload;
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting">{point.label}</Text>
        <Text type="body" weight="bold">
          {formatSiNumber(point.value)}
        </Text>
      </VStack>
    </Card>
  );
};

export const MetricBarChart = ({
  data,
  title,
}: {
  data: MetricBarDatum[];
  title: string;
}) => {
  const { token } = useTheme();
  const fill = token("--color-icon-blue");
  const grid = token("--color-border");
  const axisText = token("--color-text-secondary");
  const height = Math.max(120, data.length * 36 + 24);

  return (
    <Card>
      <VStack gap={4}>
        <Heading level={4}>{title}</Heading>
        {data.length === 0 ? (
          <Center axis="both" minHeight={120}>
            <Text color="secondary" type="supporting">
              {m.admin_workload_metrics_no_data()}
            </Text>
          </Center>
        ) : (
          <ResponsiveContainer height={height} width="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ bottom: 5, left: 0, right: 16, top: 5 }}
            >
              <CartesianGrid horizontal={false} stroke={grid} />
              <XAxis
                axisLine={false}
                tick={{ fill: axisText, fontSize: 12 }}
                tickFormatter={(value: number) => formatSiNumber(value)}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                dataKey="label"
                tick={{ fill: axisText, fontSize: 12 }}
                tickLine={false}
                type="category"
                width={140}
              />
              <Tooltip
                content={<BarTooltip />}
                cursor={{ fill: "transparent" }}
              />
              <Bar dataKey="value" fill={fill} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </VStack>
    </Card>
  );
};

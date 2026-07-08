import { useMemo } from 'react';
import type { Segment } from './fit';
import { extractSegmentMetrics } from './charts';
import MetricToggleChart from './MetricToggleChart';

export default function SegmentChart({ segment }: { segment: Segment }) {
  const { x, metrics } = useMemo(() => extractSegmentMetrics(segment), [segment]);

  if (metrics.length === 0) return null;

  return (
    <MetricToggleChart
      title={`${segment.label} セグメント`}
      x={x}
      metrics={metrics}
      defaultKeys={metrics.slice(0, 2).map((m) => m.key)}
    />
  );
}

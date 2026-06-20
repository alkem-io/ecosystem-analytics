import { useTranslation } from 'react-i18next';
import type { GraphDataset } from '@server/types/graph.js';

interface GraphMetricsBarProps {
  dataset: GraphDataset;
}

/**
 * Slim metrics bar pinned to the bottom of the graph view. Surfaces the dataset
 * network metrics (`dataset.metrics`) plus per-category node counts derived from
 * the (already gemeente-filtered) dataset passed in.
 */
export function GraphMetricsBar({ dataset }: GraphMetricsBarProps) {
  const { t } = useTranslation();
  const { metrics, nodes } = dataset;

  let spaces = 0;
  let orgs = 0;
  let initiatives = 0;
  for (const n of nodes) {
    if (n.type === 'SPACE_L0' || n.type === 'SPACE_L1' || n.type === 'SPACE_L2') spaces += 1;
    else if (n.type === 'ORGANIZATION') orgs += 1;
    else if (n.type === 'INITIATIVE') initiatives += 1;
  }

  const items: { label: string; value: string }[] = [
    { label: t('graph.metrics.nodes', { defaultValue: 'Nodes' }), value: String(metrics.totalNodes) },
    { label: t('graph.metrics.edges', { defaultValue: 'Edges' }), value: String(metrics.totalEdges) },
    {
      label: t('graph.metrics.avgDegree', { defaultValue: 'Avg degree' }),
      value: metrics.averageDegree.toFixed(2),
    },
    {
      label: t('graph.metrics.density', { defaultValue: 'Density' }),
      value: metrics.density.toFixed(3),
    },
    { label: t('graph.metrics.spaces', { defaultValue: 'Spaces' }), value: String(spaces) },
    { label: t('graph.metrics.orgs', { defaultValue: 'Organisations' }), value: String(orgs) },
    {
      label: t('graph.metrics.initiatives', { defaultValue: 'Initiatives' }),
      value: String(initiatives),
    },
  ];

  return (
    <div className="flex shrink-0 items-center gap-x-5 gap-y-1 overflow-x-auto border-t border-border bg-background/95 px-6 py-1.5 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1 whitespace-nowrap">
          <span>{item.label}</span>
          <span className="font-semibold text-foreground">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

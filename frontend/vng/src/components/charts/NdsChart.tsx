import { useTranslation } from 'react-i18next';
import type { DashboardDimension } from '@server/types/api.js';
import { CategoryBarChart } from './CategoryBarChart.js';

interface NdsChartProps {
  dimension: DashboardDimension | undefined;
  /** True when GD initiatives are stacked into the counts (FR-021). */
  gdIncluded: boolean;
}

/** Bar chart of counts by NDS category (US3, FR-021). */
export function NdsChart({ dimension, gdIncluded }: NdsChartProps) {
  const { t } = useTranslation();
  return (
    <CategoryBarChart
      title={t('dashboard.nds')}
      sourceLabel={gdIncluded ? t('dashboard.sourceSpacesGd') : t('dashboard.sourceSpaces')}
      dimension={dimension}
      labelNamespace="categories.nds"
      emptyLabel={t('dashboard.noData')}
      gdIncluded={gdIncluded}
    />
  );
}

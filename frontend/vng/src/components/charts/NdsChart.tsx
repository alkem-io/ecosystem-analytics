import { useTranslation } from 'react-i18next';
import type { DashboardDimension } from '@server/types/api.js';
import { CategoryBarChart } from './CategoryBarChart.js';

interface NdsChartProps {
  dimension: DashboardDimension | undefined;
  /** Active counting source from the dashboard response (FR-021). */
  source: 'spaces' | 'gd-initiatives';
}

/** Bar chart of counts by NDS category (US3, FR-021). */
export function NdsChart({ dimension, source }: NdsChartProps) {
  const { t } = useTranslation();
  return (
    <CategoryBarChart
      title={t('dashboard.nds')}
      sourceLabel={
        source === 'gd-initiatives' ? t('dashboard.sourceInitiatives') : t('dashboard.sourceSpaces')
      }
      dimension={dimension}
      labelNamespace="categories.nds"
      emptyLabel={t('dashboard.noData')}
    />
  );
}

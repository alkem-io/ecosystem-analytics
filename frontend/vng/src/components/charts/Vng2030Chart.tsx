import { useTranslation } from 'react-i18next';
import type { DashboardDimension } from '@server/types/api.js';
import { CategoryBarChart } from './CategoryBarChart.js';

interface Vng2030ChartProps {
  dimension: DashboardDimension | undefined;
  /** Active counting source from the dashboard response (FR-021). */
  source: 'spaces' | 'gd-initiatives';
}

/** Bar chart of counts by VNG-2030 theme (US3, FR-021). */
export function Vng2030Chart({ dimension, source }: Vng2030ChartProps) {
  const { t } = useTranslation();
  return (
    <CategoryBarChart
      title={t('dashboard.vng2030')}
      sourceLabel={
        source === 'gd-initiatives' ? t('dashboard.sourceInitiatives') : t('dashboard.sourceSpaces')
      }
      dimension={dimension}
      labelNamespace="categories.vng2030"
      emptyLabel={t('dashboard.noData')}
    />
  );
}

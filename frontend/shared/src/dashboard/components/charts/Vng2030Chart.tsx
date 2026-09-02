import { useTranslation } from 'react-i18next';
import type { DashboardDimension, VocabularyDrift } from '@server/types/api.js';
import { CategoryBarChart } from './CategoryBarChart.js';

interface Vng2030ChartProps {
  dimension: DashboardDimension | undefined;
  /** True when GD initiatives are stacked into the counts (FR-021). */
  gdIncluded: boolean;
  /** Vocabulary mismatch for this dimension, shown as a notice under the chart. */
  drift?: VocabularyDrift;
}

/** Bar chart of counts by VNG-2030 theme (US3, FR-021). */
export function Vng2030Chart({ dimension, gdIncluded, drift }: Vng2030ChartProps) {
  const { t } = useTranslation();
  return (
    <CategoryBarChart
      title={t('dashboard.vng2030')}
      sourceLabel={gdIncluded ? t('dashboard.sourceSpacesGd') : t('dashboard.sourceSpaces')}
      dimension={dimension}
      emptyLabel={t('dashboard.noData')}
      gdIncluded={gdIncluded}
      drift={drift}
    />
  );
}

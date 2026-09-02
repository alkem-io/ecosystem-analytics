import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import type { VocabularyDrift } from '@server/types/api.js';

interface Props {
  drift: VocabularyDrift | undefined;
}

/**
 * Warning shown BELOW a category chart when Alkemio's vocabulary for that dimension
 * differs from the set this build expects (`server/src/transform/expected-vocabularies.ts`).
 *
 * Advisory, never blocking: every live value is still charted and still counted, so this
 * explains bars rather than hiding them. It exists because the alternative — the VNG-2030
 * chart quietly growing five governance themes nobody had reviewed — is indistinguishable
 * from a rendering bug.
 *
 * Value labels are rendered verbatim, as authored in Alkemio (FR-024), and are never
 * translated; only the surrounding sentence is localised.
 */
export function VocabularyDriftNotice({ drift }: Props) {
  const { t } = useTranslation();
  if (!drift || (drift.unexpected.length === 0 && drift.missing.length === 0)) return null;

  const list = (labels: string[]) => labels.map((l) => `“${l}”`).join(', ');

  return (
    <div
      role="status"
      className="mt-2 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {drift.unexpected.length > 0 && (
          <p>
            {t('dashboard.driftUnexpected', {
              count: drift.unexpected.length,
              labels: list(drift.unexpected),
              defaultValue:
                'Unexpected in Alkemio and not reviewed for this dashboard: {{labels}}. They are still shown and still counted.',
            })}
          </p>
        )}
        {drift.missing.length > 0 && (
          <p>
            {t('dashboard.driftMissing', {
              count: drift.missing.length,
              labels: list(drift.missing),
              defaultValue:
                'Expected by this dashboard but no longer in Alkemio: {{labels}}. Possibly renamed.',
            })}
          </p>
        )}
      </div>
    </div>
  );
}

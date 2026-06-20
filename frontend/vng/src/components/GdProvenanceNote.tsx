import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';

/**
 * Short provenance note about the GemeenteDelers programme (US10, FR-047),
 * shown when the initiatives layer is enabled. Links to the original source.
 */
export function GdProvenanceNote() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        {t('provenance.gd')}{' '}
        <a
          href="https://vng.nl/praktijkvoorbeelden"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline"
        >
          vng.nl/praktijkvoorbeelden
        </a>
      </p>
    </div>
  );
}

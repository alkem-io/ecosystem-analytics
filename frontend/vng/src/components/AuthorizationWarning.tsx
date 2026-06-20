import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

/**
 * Prominent, recognisably "warning"-styled notice that the user only sees data
 * they are authorised to access (FR-026/027).
 */
export function AuthorizationWarning() {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-warning/40 bg-warning/10 px-6 py-2 text-sm text-foreground"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p>
        <span className="font-semibold">{t('warning.authTitle')}: </span>
        {t('warning.authBody')}
      </p>
    </div>
  );
}

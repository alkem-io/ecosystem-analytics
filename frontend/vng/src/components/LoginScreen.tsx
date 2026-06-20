import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { login } from '@ea/shared';
import { AlkemioLogo } from './AlkemioLogo';

/** Public environment info shown before sign-in (which Alkemio env we connect to). */
function useEnvironmentUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/features')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUrl(data?.alkemioServerUrl ?? null))
      .catch(() => setUrl(null));
  }, []);
  return url;
}

/** Derive a friendly environment name from the Alkemio server URL. */
function deriveEnvironmentName(url: string | null): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('acc-alkem.io')) return 'Acceptance';
  if (lower.includes('alkem.io')) return 'Production';
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return 'Local';
  return null;
}

/**
 * VNG identity gate. No in-app credential form — sign-in redirects to Alkemio's
 * hosted login. Displays the Alkemio environment (friendly name + URL) being
 * connected to (user feedback).
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const environmentUrl = useEnvironmentUrl();
  const environmentName = useMemo(() => deriveEnvironmentName(environmentUrl), [environmentUrl]);

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        {/* Alkemio branding (aligned with client-web auth screens) */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <AlkemioLogo aria-hidden="true" className="h-7 w-7 shrink-0" />
          <span className="text-lg font-bold uppercase tracking-wide text-foreground">Alkemio</span>
        </div>

        <h1 className="text-xl font-semibold">{t('app.title')}</h1>
        <p className="mt-2 text-sm font-medium text-foreground">
          {t('login.enterDashboard', {
            defaultValue:
              'Sign in to enter the VNG Kenniscentrum Innovatie Analytics Dashboard',
          })}
        </p>

        <p className="mt-4 text-sm text-muted-foreground">
          {t('login.prompt', {
            defaultValue: 'Sign in with your Alkemio account to continue.',
          })}
        </p>

        <button
          type="button"
          onClick={() => login('/')}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          {t('login.cta', { defaultValue: 'Sign in with Alkemio' })}
        </button>

        {environmentUrl && (
          <div className="mt-6 rounded-md border border-border bg-background px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {t('login.connectingTo', { defaultValue: 'Connecting to' })}{' '}
            </span>
            {environmentName && (
              <span className="font-semibold text-foreground">{environmentName}</span>
            )}
            <div className="mt-1 break-all text-xs text-muted-foreground">{environmentUrl}</div>
          </div>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          {t('login.tagline', { defaultValue: 'Safe Spaces for Collaboration' })}
        </p>
      </div>
    </div>
  );
}

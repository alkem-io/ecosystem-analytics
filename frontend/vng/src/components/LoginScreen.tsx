import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { login } from '@ea/shared';

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

/**
 * VNG identity gate. No in-app credential form — sign-in redirects to Alkemio's
 * hosted login. Displays the environment URL being connected to (user feedback).
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const environmentUrl = useEnvironmentUrl();

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <img src="/favicon.svg" alt="" className="mx-auto mb-4 h-12 w-12" aria-hidden />
        <h1 className="text-xl font-semibold">{t('app.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('app.subtitle')}</p>

        <p className="mt-6 text-sm text-muted-foreground">
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
          <p className="mt-6 break-all text-xs text-muted-foreground">
            {t('login.connectingTo', { defaultValue: 'Connecting to' })}{' '}
            <strong className="font-semibold text-foreground">{environmentUrl}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

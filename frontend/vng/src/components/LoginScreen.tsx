import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { cn, login } from '@ea/shared';
import { AlkemioLogo } from './AlkemioLogo';

interface EnvInfo {
  url: string | null;
  loading: boolean;
}

/** Public environment info shown before sign-in (which Alkemio env we connect to). */
function useEnvironment(): EnvInfo {
  const [info, setInfo] = useState<EnvInfo>({ url: null, loading: true });
  useEffect(() => {
    let active = true;
    fetch('/api/features')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => active && setInfo({ url: data?.alkemioServerUrl ?? null, loading: false }))
      .catch(() => active && setInfo({ url: null, loading: false }));
    return () => {
      active = false;
    };
  }, []);
  return info;
}

function deriveEnvironmentName(url: string | null): string | null {
  if (!url) return null;
  const l = url.toLowerCase();
  if (l.includes('acc-alkem.io')) return 'Acceptance';
  if (l.includes('alkem.io')) return 'Production';
  if (l.includes('localhost') || l.includes('127.0.0.1')) return 'Local';
  return null;
}

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/**
 * VNG identity gate — one centered card on the Alkemio-navy brand background.
 * No in-app credential form; sign-in redirects to Alkemio's hosted login. Always
 * states the Alkemio environment being connected to.
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const { url, loading } = useEnvironment();
  const name = useMemo(() => deriveEnvironmentName(url), [url]);

  // When the environment is recognised (Acceptance/Production/Local) show just the
  // friendly name; only fall back to the raw host when the name is unknown.
  const envValue = name
    ? name
    : url
      ? hostOf(url)
      : loading
        ? t('login.envDetecting', { defaultValue: 'detecting…' })
        : t('login.envUnknown', { defaultValue: 'unknown' });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-primary px-6 py-12">
      {/* Brand background: navy with cyan glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#09bcd4]/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-[#09bcd4]/15 blur-3xl"
      />

      <main className="relative w-full max-w-lg rounded-2xl bg-card p-10 text-center shadow-2xl sm:p-12">
        {/* Alkemio identity */}
        <div className="flex items-center justify-center gap-2.5">
          <AlkemioLogo aria-hidden="true" className="h-8 w-8 shrink-0" />
          <span className="text-base font-bold uppercase tracking-[0.22em] text-foreground">
            Alkemio
          </span>
        </div>

        {/* Product title */}
        <h1 className="mt-8 text-2xl font-semibold leading-snug tracking-tight text-foreground sm:whitespace-nowrap sm:text-[1.75rem]">
          {t('app.title')}
        </h1>
        <p className="mt-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-bold uppercase tracking-[0.18em] text-primary">
          {t('login.dashboardLabel', { defaultValue: 'Analytics Dashboard' })}
        </p>

        <div className="my-8 h-px w-full bg-border" />

        {/* Prompt + CTA */}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('login.prompt', { defaultValue: 'Sign in with your Alkemio account to continue.' })}
        </p>
        <button
          type="button"
          onClick={() => login(window.location.origin + '/')}
          className={cn(
            'mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4',
            'bg-primary text-base font-semibold text-primary-foreground',
            'shadow-md shadow-primary/25 ring-1 ring-inset ring-white/10',
            'transition-all hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/30 active:translate-y-px',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {t('login.cta', { defaultValue: 'Sign in' })}
        </button>

        {/* Environment */}
        <div className="mt-8 rounded-lg bg-muted/50 px-4 py-3 text-left">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('login.environment', { defaultValue: 'Environment' })}
          </span>
          <div className="mt-0.5 break-all text-sm font-medium text-foreground">{envValue}</div>
        </div>

        {/* Prototype disclaimer */}
        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-amber-600">
          {t('login.disclaimer', { defaultValue: 'Prototype for exploration' })}
        </p>
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { login } from '../services/auth.js';
import { AlkemioLogo } from '../components/AlkemioLogo.js';
import styles from './LoginPage.module.css';

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

/** Human-readable explanation of a `?error=` code set by the BFF on a failed sign-in. */
function describeAuthError(error: string | null): { heading: string; message: string } | null {
  if (!error) return null;
  switch (error) {
    case 'cancelled':
      return {
        heading: 'Sign-in cancelled',
        message: 'Your sign-in was cancelled before it completed. You can try again below.',
      };
    case 'failed':
      return {
        heading: 'Sign-in could not be completed',
        message:
          "We couldn't complete sign-in with Alkemio. This is usually a temporary problem with the " +
          'sign-in service rather than your account. Please try again — if it keeps happening, ' +
          'contact your Alkemio administrator.',
      };
    default:
      return {
        heading: 'Sign-in could not be completed',
        message: 'Something went wrong while signing you in. Please try again.',
      };
  }
}

/**
 * Identity gate. There is no in-app credential form (FR-002) — signing in
 * redirects to Alkemio's hosted login, where the user picks any method
 * (password, Microsoft, LinkedIn, …). A `?error=` query (set by the BFF when a
 * sign-in is cancelled or fails) renders a clean, informative state explaining
 * why OIDC failed, with no redirect loop and no credential re-prompt (FR-009).
 */
export default function LoginPage() {
  const [params] = useSearchParams();
  const error = params.get('error');
  const authError = useMemo(() => describeAuthError(error), [error]);
  const environmentUrl = useEnvironmentUrl();
  const environmentName = useMemo(() => deriveEnvironmentName(environmentUrl), [environmentUrl]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brand}>
            <AlkemioLogo className={styles.brandLogo} />
            <span className={styles.brandName}>Alkemio</span>
          </div>
          <h1 className={styles.title}>Ecosystem Analytics</h1>
          <p className={styles.subtitle}>Safe Spaces for Collaboration</p>
        </div>

        <div className={styles.body}>
          {authError ? (
            <>
              <h2 className={styles.welcome}>{authError.heading}</h2>
              <p className={styles.error} role="alert">
                {authError.message}
              </p>
            </>
          ) : (
            <>
              <h2 className={styles.welcome}>Welcome</h2>
              <p className={styles.description}>
                Explore ecosystem-level connectivity and activity across Alkemio. Sign in with
                your Alkemio account to continue.
              </p>
            </>
          )}

          <button className={styles.cta} onClick={() => login('/spaces')}>
            Sign in with Alkemio
          </button>

          {environmentUrl && (
            <div className={styles.environment}>
              <span className={styles.environmentLabel}>Connecting to </span>
              {environmentName && (
                <strong className={styles.environmentName}>{environmentName}</strong>
              )}
              <span className={styles.environmentUrl}>{environmentUrl}</span>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.version}>v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}

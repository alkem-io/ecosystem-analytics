import { useSearchParams } from 'react-router-dom';
import { login } from '../services/auth.js';
import styles from './LoginPage.module.css';

/**
 * Identity gate. There is no in-app credential form (FR-002) — signing in
 * redirects to Alkemio's hosted login, where the user picks any method
 * (password, Microsoft, LinkedIn, …). A `?error=cancelled` query (set by the
 * BFF when a sign-in is abandoned) renders a clean "sign in to continue" state
 * with no redirect loop (FR-009 edge case).
 */
export default function LoginPage() {
  const [params] = useSearchParams();
  const error = params.get('error');

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Ecosystem Analytics</h1>
          <p className={styles.subtitle}>by Alkemio</p>
        </div>

        <div className={styles.body}>
          {error ? (
            <>
              <h2 className={styles.welcome}>Sign in to continue</h2>
              <p className={styles.description}>
                {error === 'cancelled'
                  ? 'Your sign-in was cancelled. You can try again below.'
                  : 'We could not complete sign-in. Please try again.'}
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
        </div>

        <div className={styles.footer}>
          <span className={styles.version}>v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}

import { login } from '../services/auth.js';
import styles from './LoginPage.module.css';

/**
 * Terminal "not authorized" state (FR-015): the visitor authenticated with
 * Alkemio but their account is not authorized for Ecosystem Analytics (no
 * `alkemio_actor_id` / `ecosystem-analytics` audience). No auto-redirect — that
 * would loop straight back here via silent SSO.
 */
export default function NotAuthorizedPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Ecosystem Analytics</h1>
          <p className={styles.subtitle}>by Alkemio</p>
        </div>

        <div className={styles.body}>
          <h2 className={styles.welcome}>Not authorized</h2>
          <p className={styles.description}>
            You signed in successfully, but your Alkemio account is not authorized to use
            Ecosystem Analytics. If you believe this is a mistake, contact your Alkemio
            administrator.
          </p>
          <button className={styles.cta} onClick={() => login('/spaces')}>
            Try a different account
          </button>
        </div>

        <div className={styles.footer}>
          <span className={styles.version}>v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}

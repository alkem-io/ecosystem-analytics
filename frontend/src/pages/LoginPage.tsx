import { useState } from 'react';
import styles from './LoginPage.module.css';

/**
 * Screen A — Identity Gate
 * Redirects the user to Alkemio's login page (Kratos browser flow).
 * Design reference: design-brief-figma-make.md Screen A.
 */
export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = () => {
    setLoading(true);
    setError(null);
    // Redirect to BFF login endpoint which initiates Kratos browser flow
    window.location.href = '/api/auth/login';
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Ecosystem Analytics</h1>
          <p className={styles.subtitle}>by Alkemio</p>
        </div>

        <div className={styles.body}>
          <h2 className={styles.welcome}>Welcome</h2>
          <p className={styles.description}>
            This is a standalone tool. Your Alkemio account controls access to sensitive data.
          </p>
          <p className={styles.security}>
            You'll only see Spaces and connections you are authorized to access as a Portfolio Owner.
          </p>

          {error && <p className={styles.error}>{error}</p>}

          <button
            className={styles.cta}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign in with Alkemio'}
          </button>
        </div>

        <div className={styles.footer}>
          <span className={styles.version}>v1.0.0</span>
        </div>
      </div>
    </div>
  );
}

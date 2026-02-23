import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, openAuthPopup } from '../services/auth.js';
import styles from './LoginPage.module.css';

/**
 * Screen A — Identity Gate
 *
 * Opens a popup to Alkemio's Kratos login page. After successful auth,
 * the popup sends back a JWT via postMessage. The JWT is stored in memory
 * and used as a Bearer token for all BFF requests.
 *
 * Design reference: design-brief-figma-make.md Screen A.
 */

const ALKEMIO_URL = import.meta.env.VITE_ALKEMIO_URL || 'https://alkem.io';

interface Props {
  onLogin?: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await openAuthPopup(ALKEMIO_URL);
      setToken(token);
      onLogin?.();
      navigate('/spaces');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
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
            {loading ? 'Signing in...' : 'Sign in with Alkemio'}
          </button>
        </div>

        <div className={styles.footer}>
          <span className={styles.version}>v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}

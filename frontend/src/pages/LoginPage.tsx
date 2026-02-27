import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../services/auth.js';
import styles from './LoginPage.module.css';

/**
 * Screen A — Identity Gate
 *
 * Email/password form that authenticates via the BFF's Kratos API flow.
 * Credentials are sent to POST /api/auth/login, which authenticates
 * against Alkemio's Kratos and returns a session token.
 *
 * Design reference: design-brief-figma-make.md Screen A.
 */

interface Props {
  onLogin?: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Login failed');
        return;
      }

      setToken(data.token);
      onLogin?.();
      navigate('/spaces');
    } catch {
      setError('Unable to reach authentication service');
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
            Sign in with your Alkemio account to explore your portfolio.
          </p>
          <p className={styles.security}>
            Currently only username/password Alkemio identities are supported. SSO/OIDC login (Microsoft, LinkedIn, etc.) is not yet available.
          </p>

          <form onSubmit={handleLogin}>
            <input
              type="email"
              className={styles.input}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-label="Email address"
            />

            <input
              type="password"
              className={styles.input}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-label="Password"
            />

            {error && <p className={styles.error}>{error}</p>}

            <button
              type="submit"
              className={styles.cta}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in with Alkemio'}
            </button>
          </form>
        </div>

        <div className={styles.footer}>
          <span className={styles.version}>v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}

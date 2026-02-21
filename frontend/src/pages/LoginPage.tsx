import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../services/auth.js';
import styles from './LoginPage.module.css';

/**
 * Screen A — Identity Gate
 *
 * Production: Redirects to Alkemio SSO (Kratos browser flow). FR-001.
 * Dev mode:   Shows email/password form when DEV_AUTH_BYPASS=true on the server.
 *             Credentials go to the BFF's /api/auth/dev-login (Kratos API flow).
 *
 * Design reference: design-brief-figma-make.md Screen A.
 */

interface Props {
  onLogin?: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const navigate = useNavigate();
  const [devMode, setDevMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Probe whether dev-login is available
  useEffect(() => {
    fetch('/api/auth/dev-login', { method: 'POST' })
      .then((res) => {
        // 400 = endpoint exists (missing fields), 404 = not enabled
        setDevMode(res.status !== 404);
      })
      .catch(() => setDevMode(false));
  }, []);

  const handleSsoLogin = () => {
    setLoading(true);
    window.location.href = '/api/auth/login';
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/dev-login', {
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
            This is a standalone tool. Your Alkemio account controls access to sensitive data.
          </p>

          {!devMode ? (
            <>
              <p className={styles.security}>
                You'll only see Spaces and connections you are authorized to access as a Portfolio Owner.
              </p>

              {error && <p className={styles.error}>{error}</p>}

              <button
                className={styles.cta}
                onClick={handleSsoLogin}
                disabled={loading}
              >
                {loading ? 'Redirecting...' : 'Sign in with Alkemio'}
              </button>
            </>
          ) : (
            <form onSubmit={handleDevLogin}>
              <p className={styles.devBadge}>Dev mode</p>

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
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.version}>v1.0.0</span>
        </div>
      </div>
    </div>
  );
}

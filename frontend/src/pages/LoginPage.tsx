import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, isAuthenticated, detectSsoSession, type SsoDetectResult } from '../services/auth.js';
import styles from './LoginPage.module.css';

/**
 * Screen A — Identity Gate
 *
 * Detects an existing Alkemio/Kratos session on mount. If found, shows a
 * confirmation prompt. If not, or if the user declines, shows the standard
 * email/password login form.
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

  // SSO detection state
  const [ssoChecking, setSsoChecking] = useState(true);
  const [ssoResult, setSsoResult] = useState<SsoDetectResult | null>(null);

  // On mount: skip SSO detection if already authenticated (FR-011)
  useEffect(() => {
    if (isAuthenticated()) {
      setSsoChecking(false);
      return;
    }

    let cancelled = false;
    detectSsoSession().then((result) => {
      if (cancelled) return;
      if (result?.detected) {
        setSsoResult(result);
      }
      setSsoChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSsoConfirm = () => {
    if (!ssoResult?.token) {
      setError('Session token not available. Please log in manually.');
      setSsoResult(null);
      return;
    }

    setToken(ssoResult.token);
    onLogin?.();
    navigate('/spaces');
  };

  const handleSsoDecline = () => {
    setSsoResult(null);
  };

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

  // Show a brief loading state while SSO detection runs (max 2s timeout)
  if (ssoChecking) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Ecosystem Analytics</h1>
            <p className={styles.subtitle}>by Alkemio</p>
          </div>
          <div className={styles.body}>
            <p className={styles.description}>Checking for existing session...</p>
          </div>
        </div>
      </div>
    );
  }

  // SSO session detected — show confirmation prompt
  if (ssoResult?.detected) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Ecosystem Analytics</h1>
            <p className={styles.subtitle}>by Alkemio</p>
          </div>

          <div className={styles.body}>
            <h2 className={styles.welcome}>Welcome back</h2>
            <div className={styles.ssoPrompt}>
              {ssoResult.avatarUrl ? (
                <img
                  className={styles.ssoAvatar}
                  src={ssoResult.avatarUrl}
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className={styles.ssoAvatarPlaceholder}>
                  {(ssoResult.displayName ?? '?')[0].toUpperCase()}
                </div>
              )}
              <p className={styles.ssoName}>{ssoResult.displayName}</p>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.cta} onClick={handleSsoConfirm}>
              Continue as {ssoResult.displayName}
            </button>

            <button className={styles.ssoDecline} onClick={handleSsoDecline}>
              Use a different account
            </button>
          </div>

          <div className={styles.footer}>
            <span className={styles.version}>v{__APP_VERSION__}</span>
          </div>
        </div>
      </div>
    );
  }

  // Standard login form
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
            This is an experimental tool for exploring ecosystem-level data across Alkemio.
            The exact end state is not yet defined — we are exploring what the value add can be.
          </p>
          <div className={styles.authNotice}>
            <strong>Authentication note:</strong> Currently only username/password Alkemio identities are supported.
            SSO/OIDC login (Microsoft, LinkedIn, etc.) is not yet available.
          </div>

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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../services/auth.js';
import { Button } from '../components/ui/button.js';
import { Network, Loader2, AlertCircle } from 'lucide-react';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 16px',
  fontSize: 14,
  borderRadius: 10,
  border: '2px solid #cbd5e1',
  background: '#f8fafc',
  outline: 'none',
  color: '#0f172a',
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
};

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
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: '#eef2f7' }}
    >
      <div
        className="w-full overflow-hidden"
        style={{
          maxWidth: 420,
          borderRadius: 16,
          background: '#ffffff',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Branding */}
        <div style={{ padding: '40px 40px 12px', textAlign: 'center' }}>
          <div
            className="flex items-center justify-center"
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(37, 99, 235, 0.08)',
              color: '#2563eb',
              margin: '0 auto 14px',
            }}
          >
            <Network style={{ width: 28, height: 28 }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: '#0f172a', margin: 0 }}>
            Ecosystem Analytics
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>by Alkemio</p>
        </div>

        {/* Form */}
        <div style={{ padding: '16px 40px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Welcome back</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              Sign in with your Alkemio account
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#93b4f8';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <label htmlFor="password" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#334155', marginBottom: 6 }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#93b4f8';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {error && (
              <div
                className="flex items-center"
                style={{
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: '#fef2f2',
                  color: '#dc2626',
                  fontSize: 14,
                }}
              >
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                height: 44,
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 10,
                marginTop: 4,
              }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            Only username/password identities supported. SSO coming soon.
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '14px 0', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>v{__APP_VERSION__}</span>
        </div>
      </div>
    </div>
  );
}

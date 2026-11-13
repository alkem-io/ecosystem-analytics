import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import {
  BrokenVisualsPanel,
  useAccessControl,
  NoAccessScreen,
  AccessCheckFailedScreen,
  ACCESS_STRINGS_EN,
} from '@ea/shared';
import LoginPage from './pages/LoginPage.js';
import NotAuthorizedPage from './pages/NotAuthorizedPage.js';
import SpaceSelector from './pages/SpaceSelector.js';
import Explorer from './pages/Explorer.js';
import { UserProvider } from './context/UserContext.js';
import { fetchMe, logout, type MeResponse } from './services/auth.js';

type AuthState = 'checking' | 'authed' | 'anon';

export default function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [me, setMe] = useState<MeResponse | null>(null);
  // Feature 026: the Explorer is ungated in production, but gateable by configuration
  // alone (FR-001) — so it honours the access report like every other application.
  const access = useAccessControl(me);

  // The session is server-side; ask the BFF who we are. A `401` (handled as
  // null) means unauthenticated — the guard routes to the login screen.
  const check = useCallback(async () => {
    const result = await fetchMe();
    setMe(result);
    setAuth(result ? 'authed' : 'anon');
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const handleLogout = useCallback(() => {
    void logout();
  }, []);

  if (auth === 'checking') {
    return null; // brief: identity probe in flight
  }

  const authed = auth === 'authed';

  if (authed && me && access.screen !== 'app') {
    return access.screen === 'no-access' && access.access?.gate ? (
      <NoAccessScreen
        accountName={me.displayName}
        gate={access.access.gate}
        strings={ACCESS_STRINGS_EN}
        checking={access.checking}
        onCheckAgain={() => void access.recheck()}
        onSignOut={handleLogout}
      />
    ) : (
      <AccessCheckFailedScreen
        strings={ACCESS_STRINGS_EN}
        checking={access.checking}
        onRetry={() => void access.recheck()}
        onSignOut={handleLogout}
      />
    );
  }

  return (
    <>
      <Routes>
      <Route
        path="/"
        element={<Navigate to={authed ? '/spaces' : '/login'} replace />}
      />
      <Route
        path="/login"
        element={authed ? <Navigate to="/spaces" replace /> : <LoginPage />}
      />
      <Route path="/not-authorized" element={<NotAuthorizedPage />} />
      <Route
        path="/spaces"
        element={
          authed ? (
            <UserProvider>
              <SpaceSelector onLogout={handleLogout} />
            </UserProvider>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/explorer"
        element={
          authed ? (
            <UserProvider>
              <Explorer onLogout={handleLogout} />
            </UserProvider>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      </Routes>
      <BrokenVisualsPanel />
    </>
  );
}

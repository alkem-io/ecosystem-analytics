import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import LoginPage from './pages/LoginPage.js';
import NotAuthorizedPage from './pages/NotAuthorizedPage.js';
import SpaceSelector from './pages/SpaceSelector.js';
import Explorer from './pages/Explorer.js';
import { UserProvider } from './context/UserContext.js';
import { fetchMe, logout } from './services/auth.js';

type AuthState = 'checking' | 'authed' | 'anon';

export default function App() {
  const [auth, setAuth] = useState<AuthState>('checking');

  // The session is server-side; ask the BFF who we are. A `401` (handled as
  // null) means unauthenticated — the guard routes to the login screen.
  const check = useCallback(async () => {
    const me = await fetchMe();
    setAuth(me ? 'authed' : 'anon');
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

  return (
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
  );
}

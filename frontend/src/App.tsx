import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useCallback, lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage.js';
import SpaceSelector from './pages/SpaceSelector.js';
import Explorer from './pages/Explorer.js';
import { UserProvider } from './context/UserContext.js';
import { isAuthenticated, clearToken } from './services/auth.js';

const Dashboard = lazy(() => import('./pages/Dashboard.js'));

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  const handleLogout = useCallback(() => {
    clearToken();
    setAuthed(false);
  }, []);

  return (
    <Routes>
      <Route path="/" element={authed ? <Navigate to="/spaces" replace /> : <LoginPage onLogin={() => setAuthed(true)} />} />
      <Route
        path="/spaces"
        element={
          authed ? (
            <UserProvider>
              <SpaceSelector onLogout={handleLogout} />
            </UserProvider>
          ) : (
            <Navigate to="/" replace />
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
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          authed ? (
            <UserProvider>
              <Suspense fallback={null}>
                <Dashboard onLogout={handleLogout} />
              </Suspense>
            </UserProvider>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
    </Routes>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import LoginPage from './pages/LoginPage.js';
import SpaceSelector from './pages/SpaceSelector.js';
import Explorer from './pages/Explorer.js';
import { isAuthenticated, clearToken } from './services/auth.js';

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
        element={authed ? <SpaceSelector onLogout={handleLogout} /> : <Navigate to="/" replace />}
      />
      <Route
        path="/explorer"
        element={authed ? <Explorer onLogout={handleLogout} /> : <Navigate to="/" replace />}
      />
    </Routes>
  );
}
